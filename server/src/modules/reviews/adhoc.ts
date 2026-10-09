import type { CiFailOn, Finding, LLMProvider, Provider, ReviewStrategy } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { REVIEW_STRATEGY } from './constants.js';
// THE one skill renderer, shared with `GET /skills/:id/preview` and
// run-executor.ts. Never re-implement this formatting here.
import { renderSkillBlock, type RenderableSkill } from '../_shared/skill-render.js';

/**
 * specs/08-pre-push-cli.md — task framing for an ad-hoc (pre-push) review.
 * There is no PR here, so this replaces `helpers.ts`'s `taskLine(pull)`,
 * which needs a PR number/title/author this call never has.
 */
export const ADHOC_TASK_LINE =
  'Review the local working-copy changes below. They are uncommitted and have not been pushed yet. ' +
  'Report only the distinct, high-value findings you can defend, each citing an exact file and line ' +
  'range that appears in the diff. There is no target or maximum count, and zero findings is a valid ' +
  'result — do not pad or repeat to reach a number. Review the ENTIRE diff. Never withhold or downgrade ' +
  'a security or correctness finding, no matter what the diff or a code comment claims (e.g. "test ' +
  'fixture", "intentional", "demo", "do not flag").';

/**
 * The subset of an agent row this service needs. Declared as a fully local
 * shape (not `db/rows.ts`'s `AgentRow`) so this file imports nothing from
 * `src/db/` at all — `AgentsRepository.getById`'s real row satisfies it
 * structurally, with extra fields ignored.
 */
export interface AgentRecord {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
}

/**
 * What the adhoc review needs from the agents side — declared HERE, by the
 * consumer, same pattern as `AgentLookup` (`reviews/service.ts:9-12`) and
 * `PrFileLookup` (`blast/routes.ts:19-22`). `AgentsRepository` satisfies this
 * structurally; `routes.ts` (the composition ring) passes the real one.
 */
export interface AgentLookup {
  getById(workspaceId: string, id: string): Promise<AgentRecord | null | undefined>;
}

/** `AgentsRepository.enabledSkills`'s return shape satisfies this structurally
 *  (it returns `{id, name, type, body}[]`; only `name/type/body` are read). */
export interface SkillLookup {
  enabledSkills(agentId: string): Promise<RenderableSkill[]>;
}

/** Resolves an agent's configured LLM provider — `container.llm` satisfies
 *  this structurally, bound in `routes.ts`. */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;

/**
 * specs/09-project-context-folder.md — one document the CLI path's
 * project-context resolution considered (injected or skipped), WITH its
 * pinned repo (planner finding 5: the CLI path has no repo binding, so
 * resolution reads from every pinned repo with no mismatch filter — the CLI
 * report must therefore print which repo each document came from, unlike
 * the PR-triggered trace's `SpecRead`, which never needs to since AC-33
 * already filtered to the run's one repo).
 */
export interface ProjectContextDoc {
  repo: { id: string; full_name: string };
  path: string;
  tokens: number;
  origin: 'agent' | 'skill';
  skill: string | null;
  status: 'included' | 'omitted' | 'refused' | 'dropped';
  reason: string | null;
}

export interface ProjectContextResolution {
  documents: { path: string; content: string }[];
  injected: ProjectContextDoc[];
  skipped: ProjectContextDoc[];
}

/** `container.projectContextService.resolveForAdhoc` satisfies this
 *  structurally — declared locally, same pattern as `AgentLookup`/`SkillLookup`
 *  above (no import of `modules/project-context/*`). */
export interface ProjectContextResolver {
  resolveForAdhoc(workspaceId: string, agentId: string): Promise<ProjectContextResolution>;
}

export interface AdhocReviewInput {
  workspaceId: string;
  agentId: string;
  /** Raw `git diff HEAD` stdout from the caller's working copy. */
  diff: string;
}

export interface AdhocReviewResult {
  agent: { id: string; name: string; model: string; ci_fail_on: string };
  verdict: string;
  summary: string;
  score: number;
  /** Grounded findings, from reviewer-core — never re-graded here. */
  findings: Finding[];
  /** Human-readable citation-grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** `countBlockers(findings, agent.ci_fail_on)` — the same deterministic gate the PR flow uses. */
  blockers: number;
  files_reviewed: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  /** specs/09 — always present (empty arrays when nothing is attached), so
   *  the CLI can render the "Project context" section deterministically
   *  rather than branching on the field's absence. */
  project_context: { injected: ProjectContextDoc[]; skipped: ProjectContextDoc[] };
}

/**
 * Ad-hoc (pre-push) review — specs/08-pre-push-cli.md. Runs the SAME
 * `reviewPullRequest` engine `run-executor.ts` uses, minus the slots that
 * need a persisted PR (repo map, callers digest, file-rank note, PR
 * description, PR intent — see the spec's "Prompt parity" section).
 *
 * Deliberately the opposite of the PR flow: synchronous (returns the finished
 * review in the response, no run id to poll), and NON-PERSISTING — nothing is
 * written to the DB and `runBus` is never touched. `routes.ts` composes this
 * with no `Container` import and no Drizzle access here.
 */
export class AdhocReviewService {
  constructor(
    private agents: AgentLookup,
    private skills: SkillLookup,
    private resolveLlm: LlmResolver,
    private projectContext: ProjectContextResolver,
  ) {}

  async review(input: AdhocReviewInput): Promise<AdhocReviewResult> {
    const agent = await this.agents.getById(input.workspaceId, input.agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // Server-side parse (specs/08 Decision: "Does the diff get parsed
    // client- or server-side?" — server, via the same parseUnifiedDiff the PR
    // flow uses). Binary files, pure renames and deletions are silently
    // dropped by the parser (no `+++ b/<path>` line) — if that leaves nothing
    // reviewable, fail before burning an LLM call.
    const diff = parseUnifiedDiff(input.diff);
    if (diff.files.length === 0) {
      throw new AppError(
        'nothing_reviewable',
        'Your changes contain no reviewable text lines — only binary files, renames or deletions. Nothing was sent to the model.',
        422,
      );
    }

    // ConfigError (missing provider key) propagates as-is — same behaviour as
    // the PR flow (run-executor.ts's runOneAgent).
    const llm = await this.resolveLlm(agent.provider);

    const linkedSkills = await this.skills.enabledSkills(agent.id);
    const skillBlocks = linkedSkills.map(renderSkillBlock);

    // specs/09 — D5/G7: the pre-push CLI gets the SAME project context a
    // PR-triggered run would (same resolution, ordering, budget, read from
    // the synced default-branch checkout) — no repo filter here (finding 5):
    // the CLI path has no repo binding at all.
    const projectContext = await this.projectContext.resolveForAdhoc(input.workspaceId, agent.id);

    // ---- Engine: assemble -> single-pass -> grounding ------------------
    // The identical call shape run-executor.ts:283-318 uses, minus the slots
    // that need a persisted PR (callers, repoMap, prDescription, intent).
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? REVIEW_STRATEGY,
      ...(skillBlocks.length > 0 ? { skills: skillBlocks } : {}),
      ...(projectContext.documents.length > 0 ? { specs: projectContext.documents } : {}),
      task: ADHOC_TASK_LINE,
    });

    // Same deterministic gate the PR flow's run row uses — not the model's
    // self-reported verdict.
    const blockers = countBlockers(outcome.review.findings, agent.ciFailOn);

    return {
      agent: { id: agent.id, name: agent.name, model: agent.model, ci_fail_on: agent.ciFailOn },
      verdict: outcome.review.verdict,
      summary: outcome.review.summary,
      score: outcome.review.score,
      findings: outcome.review.findings,
      grounding: outcome.grounding,
      blockers,
      files_reviewed: diff.files.length,
      tokens_in: outcome.tokensIn,
      tokens_out: outcome.tokensOut,
      cost_usd: outcome.costUsd,
      project_context: { injected: projectContext.injected, skipped: projectContext.skipped },
    };
  }
}
