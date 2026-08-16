import type { OnboardingGenerateResult, OnboardingPage, OnboardingProvenance } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { FeatureModelResolver, LlmResolver, RepoIntelIndexState, RepoIntelPort, RepoLookup, Tokenizer } from './ports.js';
import { OnboardingRepository, type OnboardingTourRow } from './repository.js';
import { assembleFacts, type FactSet } from './facts.js';
import { buildOnboardingMessages } from './prompts.js';
import { OnboardingGenerationOutput } from './schemas.js';
import { groundTour } from './grounding.js';
import { renderFacts, renderTour } from './render.js';
import { DEFAULT_HOTNESS_WINDOW_DAYS, GENERATABLE_STATUSES, ONBOARDING_MAX_OUTPUT_TOKENS } from './constants.js';

/** `container.priceBook.estimate` — injected structurally, never imported. */
export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

/** Minimal pino-compatible logger (mirrors `reviews/run-executor.ts`'s
 *  `Logger`) — US-6's "open the logs and see one call" without a debugger. */
export interface OnboardingLogger {
  info: (obj: unknown, msg?: string) => void;
}

/**
 * Application service — `getPage` (0 LLM calls, ever) and `generate` (the
 * ONE structured call per generation). No `Container` import
 * (`no-container-in-services`); every dependency is a narrow port from
 * `ports.ts`.
 *
 * The service is a process-wide SINGLETON (wired via a lazy
 * `container.onboardingService` getter) — `inFlight` only works as an
 * in-flight guard because there is exactly one instance per process.
 */
export class OnboardingService {
  private inFlight = new Set<string>();

  constructor(
    private repo: OnboardingRepository,
    private repos: RepoLookup,
    private repoIntel: RepoIntelPort,
    private resolveModel: FeatureModelResolver,
    private llm: LlmResolver,
    private tokenizer: Tokenizer,
    private estimateCost: CostEstimator,
    private logger: OnboardingLogger,
  ) {}

  /** GET /repos/:id/tour — 0 LLM calls, always (AC-19, AC-22). */
  async getPage(workspaceId: string, repoId: string): Promise<OnboardingPage | undefined> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) return undefined;

    const state = await this.repoIntel.getIndexState(repoId);
    const facts = await assembleFacts({ repoId, clonePath: repoRow.clonePath, repoIntel: this.repoIntel });
    const tour = await this.repo.getTour(repoId);
    const generating = this.inFlight.has(repoId); // AC-20: a concurrent GET also reports `generating`.

    if (tour) {
      const stale = isStale(tour, state);
      return {
        status: generating ? 'generating' : stale ? 'stale' : 'generated',
        reason: null,
        stale,
        provenance: provenanceFromTour(tour, state),
        facts: renderFacts(facts),
        tour: tour.json,
      };
    }

    if (generating) {
      return {
        status: 'generating',
        reason: null,
        stale: false,
        provenance: liveProvenance(facts),
        facts: renderFacts(facts),
        tour: null,
      };
    }

    const noTour = noTourStatus(repoRow.clonePath, state, facts);
    return {
      status: noTour.status,
      reason: noTour.reason ?? null,
      stale: false,
      provenance: liveProvenance(facts),
      facts: renderFacts(facts),
      tour: null,
    };
  }

  /** POST /repos/:id/tour/generate — AC-13, AC-20, AC-24, AC-34, AC-38. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingGenerateResult> {
    // Step 1: resolve repo (workspace-scoped) FIRST — 404 before anything
    // else is read (AC-49).
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const state = await this.repoIntel.getIndexState(repoId);
    const facts = await assembleFacts({ repoId, clonePath: repoRow.clonePath, repoIntel: this.repoIntel });

    // Step 2 (AC-37/AC-38): no checkout AND no index data at all → empty
    // state, zero provider calls.
    if (!repoRow.clonePath && facts.coverage.filesIndexed === 0 && facts.rankedFiles.length === 0) {
      return {
        status: 'empty',
        reason: 'No checkout and no index yet for this repository.',
        stale: false,
        provenance: liveProvenance(facts),
        facts: renderFacts(facts),
        tour: null,
        dropped: null,
      };
    }

    // Step 2b (Q2/AC-38): degraded/failed status, a failed import graph, or
    // zero ranked files → refuse, zero provider calls.
    const refusal = refusalReason(state, facts);
    if (refusal) {
      return {
        status: 'refused',
        reason: refusal,
        stale: false,
        provenance: liveProvenance(facts),
        facts: renderFacts(facts),
        tour: null,
        dropped: null,
      };
    }

    // Step 3 (AC-20): the in-flight guard. `has` + `add` sit in ONE
    // synchronous statement pair with no `await` between them — Node's
    // run-to-completion semantics make the pair atomic regardless of where
    // in the method it sits. It deliberately sits AFTER the workspace-scope
    // and refusal checks above, so an unauthorized/unindexed caller can
    // never observe or occupy another workspace's in-flight slot.
    if (this.inFlight.has(repoId)) {
      return {
        status: 'generating',
        reason: null,
        stale: false,
        provenance: liveProvenance(facts),
        facts: renderFacts(facts),
        tour: null,
        dropped: null,
      };
    }
    this.inFlight.add(repoId);
    try {
      return await this.runGeneration(repoId, workspaceId, state, facts);
    } finally {
      this.inFlight.delete(repoId);
    }
  }

  /** Steps 4-7 of the generation flow — extracted only so `generate()`'s
   *  in-flight try/finally stays readable. */
  private async runGeneration(
    repoId: string,
    workspaceId: string,
    state: RepoIntelIndexState,
    facts: FactSet,
  ): Promise<OnboardingGenerateResult> {
    const { provider, model } = await this.resolveModel(workspaceId, 'onboarding');
    const llm = await this.llm(provider);
    const { messages } = buildOnboardingMessages(facts, this.tokenizer);

    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: OnboardingGenerationOutput,
        schemaName: 'OnboardingGenerationOutput',
        messages,
        maxTokens: ONBOARDING_MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      this.logger.info(
        { repoId, provider, model, ok: false, error: err instanceof Error ? err.message : String(err) },
        'onboarding.generate',
      );
      return this.failedResult(repoId, state, facts);
    }

    const { sections, dropped } = groundTour(result.data, facts);
    const tour = renderTour(sections);
    const costUsd = result.costUsd ?? this.estimateCost(model, result.tokensIn, result.tokensOut);
    const generatedAt = new Date();

    await this.repo.upsertTour({
      repoId,
      json: tour,
      indexSha: state.lastIndexedSha,
      indexerVersion: state.indexerVersion,
      indexUpdatedAt: state.updatedAt ?? null,
      filesIndexed: facts.coverage.filesIndexed,
      filesExcluded: facts.coverage.filesExcluded,
      prsWeighted: facts.coverage.prsWeighted,
      provider,
      model,
      attempts: result.attempts,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd,
    });

    this.logger.info(
      {
        repoId,
        provider,
        model,
        ok: true,
        attempts: result.attempts,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd,
        dropped: {
          paths: dropped.paths.length,
          commands: dropped.commands.length,
          links: dropped.links.length,
          tasks: dropped.tasks.length,
        },
      },
      'onboarding.generate',
    );

    return {
      status: 'generated',
      reason: null,
      stale: false,
      provenance: liveProvenance(facts, {
        generatedAt,
        model,
        provider,
        attempts: result.attempts,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd,
      }),
      facts: renderFacts(facts),
      tour,
      dropped,
    };
  }

  /** AC-24/AC-34/AC-36: nothing is written; the previous tour (if any)
   *  stays intact and is still returned, alongside a failure status. */
  private async failedResult(
    repoId: string,
    state: RepoIntelIndexState,
    facts: FactSet,
  ): Promise<OnboardingGenerateResult> {
    const existing = await this.repo.getTour(repoId);
    return {
      status: 'failed',
      reason: 'Generation failed — the previous tour, if any, is unchanged.',
      stale: existing ? isStale(existing, state) : false,
      provenance: existing ? provenanceFromTour(existing, state) : liveProvenance(facts),
      facts: renderFacts(facts),
      tour: existing ? existing.json : null,
      dropped: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

/** AC-23: computed at read time, never stored. */
function isStale(tour: OnboardingTourRow, state: RepoIntelIndexState): boolean {
  if (tour.indexSha !== state.lastIndexedSha) return true;
  if (tour.indexerVersion !== state.indexerVersion) return true;
  if (tour.indexUpdatedAt && state.updatedAt > tour.indexUpdatedAt) return true;
  return false;
}

/** Q2 (decided): the skeleton-only / refuse-to-generate condition is
 *  `status ∉ GENERATABLE_STATUSES` or `graphFailed` set — NOT `partial` as
 *  such (a `partial` index is still a working index). Zero ranked files is a
 *  separate, additional refusal condition. */
function refusalReason(state: RepoIntelIndexState, facts: FactSet): string | null {
  if (!(GENERATABLE_STATUSES as readonly string[]).includes(state.status)) {
    return `Index status is "${state.status}"${state.reason ? ` (${state.reason})` : ''} — a tour needs a full or partial index.`;
  }
  if (state.graphFailed) {
    return 'No import graph for this index — the reading order would be churn-only.';
  }
  if (facts.rankedFiles.length === 0) {
    return 'No ranked files in the index yet.';
  }
  return null;
}

/** GET-only classification for "no tour stored yet" (`degraded` vs
 *  `skeleton` vs `empty`) — mirrors, but is not identical to,
 *  `refusalReason` (generation additionally refuses on zero ranked files,
 *  which does not need its own GET-time status distinct from `skeleton`). */
function noTourStatus(
  clonePath: string | null,
  state: RepoIntelIndexState,
  facts: FactSet,
): { status: 'empty' | 'degraded' | 'skeleton'; reason?: string } {
  const hasIndexData = facts.coverage.filesIndexed > 0 || facts.rankedFiles.length > 0;
  if (!clonePath && !hasIndexData) {
    return { status: 'empty', reason: 'No checkout and no index yet for this repository.' };
  }
  if (!(GENERATABLE_STATUSES as readonly string[]).includes(state.status)) {
    return {
      status: 'degraded',
      reason: `Index status is "${state.status}"${state.reason ? ` (${state.reason})` : ''}.`,
    };
  }
  if (state.graphFailed) {
    return { status: 'degraded', reason: 'No import graph for this index — the reading order would be churn-only.' };
  }
  return { status: 'skeleton' };
}

interface SpendInfo {
  generatedAt: Date;
  model: string;
  provider: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/** Provenance built from the CURRENT index/facts — used whenever no stored
 *  tour exists (skeleton/degraded/empty/refused), and for a fresh
 *  `generated` result (whose facts were assembled at generation time, i.e.
 *  already current). */
function liveProvenance(facts: FactSet, spend?: SpendInfo): OnboardingProvenance {
  return {
    files_indexed: facts.coverage.filesIndexed,
    files_excluded: facts.coverage.filesExcluded,
    index_status: facts.coverage.indexStatus,
    index_reason: facts.coverage.indexReason ?? null,
    index_sha: facts.coverage.indexSha,
    index_updated_at: facts.coverage.indexUpdatedAt ? facts.coverage.indexUpdatedAt.toISOString() : null,
    prs_weighted: facts.coverage.prsWeighted,
    hotness_window_days: facts.coverage.hotnessWindowDays ?? DEFAULT_HOTNESS_WINDOW_DAYS,
    generated_at: spend ? spend.generatedAt.toISOString() : null,
    model: spend?.model ?? null,
    provider: spend?.provider ?? null,
    attempts: spend?.attempts ?? null,
    tokens_in: spend?.tokensIn ?? null,
    tokens_out: spend?.tokensOut ?? null,
    cost_usd: spend?.costUsd ?? null,
  };
}

/**
 * Provenance for a STORED tour: identity fields (`files_indexed`,
 * `index_sha`, …) come from the tour row itself — "frozen at generation"
 * (`db/schema/context.ts`'s own doc comment) — while `index_status`/
 * `index_reason`/`hotness_window_days` are read LIVE, because the `onboarding`
 * table has no column for them; that live status is exactly what lets
 * `stale` (computed alongside this) tell "how current the index now is"
 * (AC-23) without a second frozen copy.
 */
function provenanceFromTour(tour: OnboardingTourRow, state: RepoIntelIndexState): OnboardingProvenance {
  return {
    files_indexed: tour.filesIndexed,
    files_excluded: tour.filesExcluded,
    index_status: state.status,
    index_reason: state.reason ?? null,
    index_sha: tour.indexSha,
    index_updated_at: tour.indexUpdatedAt ? tour.indexUpdatedAt.toISOString() : null,
    prs_weighted: tour.prsWeighted,
    hotness_window_days: state.hotnessWindowDays ?? DEFAULT_HOTNESS_WINDOW_DAYS,
    generated_at: tour.generatedAt.toISOString(),
    model: tour.model,
    provider: tour.provider,
    attempts: tour.attempts,
    tokens_in: tour.tokensIn,
    tokens_out: tour.tokensOut,
    cost_usd: tour.costUsd,
  };
}
