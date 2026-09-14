import type { BriefGenerateResult, BriefPage, BriefProvenance } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type {
  CloneReader,
  FeatureModelResolver,
  GithubResolver,
  LlmResolver,
  RepoIntelIndexState,
  RepoIntelPort,
  Tokenizer,
} from './ports.js';
import { BriefRepository, type BriefPullRow, type BriefPrFileRow, type BriefRow } from './repository.js';
import { assembleFacts } from './facts.js';
import { buildBriefMessages } from './prompts.js';
import { BriefGenerationOutput } from './schemas.js';
import { groundBrief } from './grounding.js';
import { BRIEF_MAX_OUTPUT_TOKENS } from './constants.js';

/** `container.priceBook.estimate` — injected structurally, never imported. */
export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

/** Minimal pino-compatible logger (mirrors `onboarding/service.ts`'s
 *  `OnboardingLogger`) — "Privacy of logs": counts/identifiers only, never
 *  issue bodies, spec content or brief prose. */
export interface BriefLogger {
  info: (obj: unknown, msg?: string) => void;
}

/**
 * Application service — `getPage` (0 LLM calls, ever, AC-23) and `generate`
 * (the ONE structured call per generation, AC-10). No `Container` import
 * (`no-container-in-services`); every dependency is a narrow port from
 * `ports.ts`.
 *
 * The service is a process-wide SINGLETON (wired via a lazy
 * `container.briefService` getter) — `inFlight` only works as an in-flight
 * guard because there is exactly one instance per process (AC-27).
 */
export class BriefService {
  private inFlight = new Set<string>();

  constructor(
    private repo: BriefRepository,
    private repoIntel: RepoIntelPort,
    private resolveModel: FeatureModelResolver,
    private llm: LlmResolver,
    private github: GithubResolver,
    private readSpec: CloneReader,
    private tokenizer: Tokenizer,
    private estimateCost: CostEstimator,
    private logger: BriefLogger,
  ) {}

  /** GET /pulls/:id/brief — 0 LLM calls, always (AC-23). */
  async getPage(workspaceId: string, prId: string): Promise<BriefPage | undefined> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) return undefined;
    const stored = await this.repo.getBrief(prId);
    const generating = this.inFlight.has(prId); // AC-27: a concurrent GET also reports `generating`.
    return this.pageFor(pull, stored, generating);
  }

  /** POST /pulls/:id/brief/generate — AC-24, AC-26, AC-27, AC-28, AC-31,
   *  AC-33, AC-44. Explicit-action only (D13/N5) — nothing here is ever
   *  called except from this route. */
  async generate(workspaceId: string, prId: string, regenerate: boolean): Promise<BriefGenerateResult> {
    // Step 1 (AC-44): workspace-scoped resolve FIRST — 404 before anything
    // else is read.
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Step 2 (AC-31): an empty file list refuses, zero provider calls. Uses
    // the persisted `pr_files` rows, never a re-fetched/re-parsed diff (Q2).
    const files = await this.repo.getPrFiles(prId);
    const stored = await this.repo.getBrief(prId);
    if (files.length === 0) {
      return {
        ...(await this.pageFor(pull, stored, false)),
        status: 'refused',
        reason: 'This pull request has no changed files to analyze.',
        dropped: null,
      };
    }

    // Step 3 (AC-24/AC-26): cache check — `regenerate === true` skips this
    // branch entirely.
    if (!regenerate && stored && stored.headSha === pull.headSha) {
      return { ...(await this.pageFor(pull, stored, false)), dropped: null };
    }

    // Step 4 (AC-27): the in-flight guard. `has` + `add` sit in ONE
    // synchronous statement pair with no `await` between them — deliberately
    // AFTER steps 1-3, so an unauthorized/file-less/cached caller can never
    // observe or occupy another workspace's in-flight slot. Copied from
    // `onboarding/service.ts:128-151`'s recipe (`server/LEARNINGS.md:84-109`
    // documents why a `Promise.all` race is not how this gets tested).
    if (this.inFlight.has(prId)) {
      return {
        status: 'generating',
        reason: null,
        brief: stored ? stored.json : null,
        provenance: stored ? provenanceFromRow(stored) : null,
        current_head_sha: pull.headSha,
        stale_markers: [],
        dropped: null,
      };
    }
    this.inFlight.add(prId);
    try {
      return await this.runGeneration(workspaceId, pull, files, stored);
    } finally {
      this.inFlight.delete(prId);
    }
  }

  /** Steps 5-8 of the generation flow — extracted only so `generate()`'s
   *  in-flight try/finally stays readable. */
  private async runGeneration(
    workspaceId: string,
    pull: BriefPullRow,
    files: BriefPrFileRow[],
    stored: BriefRow | undefined,
  ): Promise<BriefGenerateResult> {
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Step 5 (AC-1): assemble the deterministic fact set — no LLM call.
    const facts = await assembleFacts({
      pull,
      repo,
      files,
      repoIntel: this.repoIntel,
      github: this.github,
      readSpec: this.readSpec,
    });

    // Step 6 (AC-10, AC-12): exactly one structured call.
    const { provider, model } = await this.resolveModel(workspaceId, 'risk_brief');
    const llm = await this.llm(provider);
    const { messages, payload } = buildBriefMessages(facts, this.tokenizer);

    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: BriefGenerationOutput,
        schemaName: 'BriefGenerationOutput',
        messages,
        maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      this.logger.info(
        { prId: pull.id, provider, model, ok: false, error: err instanceof Error ? err.message : String(err) },
        'brief.generate',
      );
      return this.failedResult(pull, stored);
    }

    // Step 7 (AC-22): ground BEFORE persisting, so no ungrounded citation is
    // ever stored or displayed.
    const { brief, dropped } = groundBrief(result.data, facts);
    const costUsd = result.costUsd ?? this.estimateCost(model, result.tokensIn, result.tokensOut);
    const generatedAt = new Date();

    await this.repo.upsertBrief({
      prId: pull.id,
      json: brief,
      headSha: pull.headSha,
      indexSha: facts.blast.indexSha,
      indexStatus: facts.blast.indexStatus,
      indexerVersion: facts.blast.indexerVersion,
      intentResolvedAt: facts.intent.resolvedAt,
      provider,
      model,
      attempts: result.attempts,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd,
      droppedInputs: payload.droppedCount,
    });

    // Step 8: one structured log line — counts/identifiers only, never issue
    // bodies, spec content or brief prose ("Privacy of logs").
    this.logger.info(
      {
        prId: pull.id,
        provider,
        model,
        ok: true,
        attempts: result.attempts,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd,
        droppedInputCategories: payload.droppedCount,
        dropped: {
          paths: dropped.paths.length,
          lines: dropped.lines.length,
          citations: dropped.citations.length,
          links: dropped.links.length,
          risks: dropped.risks.length,
          focus: dropped.focus.length,
        },
      },
      'brief.generate',
    );

    return {
      status: 'generated',
      reason: null,
      brief,
      provenance: {
        head_sha: pull.headSha,
        generated_at: generatedAt.toISOString(),
        model,
        provider,
        attempts: result.attempts,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: costUsd,
        index_sha: facts.blast.indexSha,
        index_status: facts.blast.indexStatus,
        index_reason: facts.blast.indexReason ?? null,
        intent_resolved_at: facts.intent.resolvedAt ? facts.intent.resolvedAt.toISOString() : null,
        dropped_inputs: payload.droppedCount,
      },
      current_head_sha: pull.headSha,
      stale_markers: [],
      dropped,
    };
  }

  /** AC-28/AC-33: nothing is written; the previous brief (if any) stays
   *  intact and is still returned, alongside a `failed` status — never model
   *  prose from the failed attempt. */
  private async failedResult(pull: BriefPullRow, stored: BriefRow | undefined): Promise<BriefGenerateResult> {
    const page = await this.pageFor(pull, stored, false);
    return {
      ...page,
      status: 'failed',
      reason: 'Generation failed — the previous brief, if any, is unchanged.',
      dropped: null,
    };
  }

  /** Shared read-time classification (`getPage` and every non-generating
   *  branch of `generate`) — AC-25/AC-30/AC-41's status table. Computed at
   *  read time, never stored (`onboarding/service.ts:267-273`'s posture). */
  private async pageFor(pull: BriefPullRow, stored: BriefRow | undefined, generating: boolean): Promise<BriefPage> {
    if (!stored) {
      return {
        status: generating ? 'generating' : 'none',
        reason: null,
        brief: null,
        provenance: null,
        current_head_sha: pull.headSha,
        stale_markers: [],
      };
    }
    if (generating) {
      return {
        status: 'generating',
        reason: null,
        brief: stored.json,
        provenance: provenanceFromRow(stored),
        current_head_sha: pull.headSha,
        stale_markers: [],
      };
    }
    if (stored.headSha !== pull.headSha) {
      // Clarification 3: this ONE condition covers both "head sha moved
      // since generation" and "never generated for the new state" — a
      // single marker, always visible.
      return {
        status: 'earlier_state',
        reason: null,
        brief: stored.json,
        provenance: provenanceFromRow(stored),
        current_head_sha: pull.headSha,
        stale_markers: [describeHeadShaMarker(stored.headSha, pull.headSha)],
      };
    }
    const indexState = await this.repoIntel.getIndexState(pull.repoId);
    const staleMarkers = staleMarkersFor(stored, pull, indexState);
    return {
      status: staleMarkers.length > 0 ? 'possibly_stale' : 'generated',
      reason: null,
      brief: stored.json,
      provenance: provenanceFromRow(stored),
      current_head_sha: pull.headSha,
      stale_markers: staleMarkers,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

function describeHeadShaMarker(storedHeadSha: string, currentHeadSha: string): string {
  return `head sha (this brief describes ${storedHeadSha.slice(0, 7)}, the PR is now at ${currentHeadSha.slice(0, 7)})`;
}

/** AC-30: names WHICH marker moved — "repository index" (sha or indexer
 *  version) and/or "PR intent" (resolution time), never a bare boolean. */
function staleMarkersFor(stored: BriefRow, pull: BriefPullRow, indexState: RepoIntelIndexState): string[] {
  const markers = new Set<string>();
  if (stored.indexSha !== indexState.lastIndexedSha || stored.indexerVersion !== indexState.indexerVersion) {
    markers.add('repository index');
  }
  const storedIntent = stored.intentResolvedAt ? stored.intentResolvedAt.getTime() : null;
  const currentIntent = pull.intentResolvedAt ? pull.intentResolvedAt.getTime() : null;
  if (storedIntent !== currentIntent) markers.add('PR intent');
  return [...markers];
}

/**
 * Provenance for a STORED brief. `index_reason` is not a persisted column
 * (Approach §2's schema table) — it is only ever populated on the FRESH
 * `generated` response `runGeneration` returns directly; a re-read of a
 * stored brief reports `null` here, which is honest (the reason string is
 * transient index-state colour, not part of the frozen spend/identity
 * record `pr_brief` exists to keep).
 */
function provenanceFromRow(row: BriefRow): BriefProvenance {
  return {
    head_sha: row.headSha,
    generated_at: row.generatedAt.toISOString(),
    model: row.model,
    provider: row.provider ?? 'unknown',
    attempts: row.attempts,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    index_sha: row.indexSha,
    index_status: row.indexStatus ?? 'unknown',
    index_reason: null,
    intent_resolved_at: row.intentResolvedAt ? row.intentResolvedAt.toISOString() : null,
    dropped_inputs: row.droppedInputs,
  };
}
