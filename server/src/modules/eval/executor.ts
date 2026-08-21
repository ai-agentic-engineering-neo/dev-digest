import type { LLMProvider, PromptAssembly } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { renderSkillBlock, type RenderableSkill } from '../_shared/skill-render.js';
import { EVAL_TASK_LINE } from './constants.js';
import type { AgentRecord } from './ports.js';
import type { ScoredFinding } from './scoring.js';

/**
 * specs/12-eval-pipeline.md Approach §4 (Q2/AC-8/AC-9/AC-10) — a second,
 * NARROWER instance of `modules/reviews/adhoc.ts`'s posture ("the SAME
 * engine `run-executor.ts` uses, minus the slots that need a persisted PR").
 * No flag/parameter/branch is added to `ReviewRunExecutor` itself.
 *
 * DELIBERATELY ABSENT, each one an AC-9 assertion: `specs` (no project-context
 * resolution — this path never calls `projectContextService`), `callers`,
 * `repoMap`, `intent`, `intentInScope`, `intentOutOfScope`, `memory`,
 * `sessionId`. Nothing here touches `container.repoIntel`, a checkout, or the
 * `pull_requests` intent columns.
 */

export interface EvalCaseForExecution {
  /** The finding's/frozen input's file diff (D8/D16) — the synthesized,
   *  self-contained unified diff `frozen-input.ts` produced at creation. */
  inputDiff: string;
  inputMeta: { pr_number: number | null; title: string; body: string | null };
}

export interface EvalCaseExecutionResult {
  /** Findings GROUNDED (kept) by the citation gate — never the raw model
   *  output (finding 6: `ReviewOutcome.review.findings` is the kept set,
   *  `ReviewOutcome.dropped` is the dropped set). */
  findings: ScoredFinding[];
  groundingKept: number;
  groundingTotal: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  durationMs: number;
  /** AC-10's byte-identical-input test compares this. */
  assembly: PromptAssembly;
}

export class EvalExecutor {
  async runCase(
    agent: AgentRecord,
    skillBlocks: RenderableSkill[],
    llm: LLMProvider,
    evalCase: EvalCaseForExecution,
  ): Promise<EvalCaseExecutionResult> {
    const started = Date.now();
    const diff = parseUnifiedDiff(evalCase.inputDiff);
    const renderedSkills = skillBlocks.map(renderSkillBlock);

    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy ?? 'single-pass',
      ...(renderedSkills.length > 0 ? { skills: renderedSkills } : {}),
      ...(evalCase.inputMeta.body ? { prDescription: evalCase.inputMeta.body } : {}),
      task: `${EVAL_TASK_LINE} Frozen case title: "${evalCase.inputMeta.title}".`,
    });

    // finding 6 — kept = outcome.review.findings.length, total = kept + dropped.
    const groundingKept = outcome.review.findings.length;
    const groundingTotal = groundingKept + outcome.dropped.length;

    return {
      findings: outcome.review.findings,
      groundingKept,
      groundingTotal,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      costUsd: outcome.costUsd,
      durationMs: Date.now() - started,
      assembly: outcome.assembly,
    };
  }
}
