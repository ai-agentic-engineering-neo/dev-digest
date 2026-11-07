import { createHash } from 'node:crypto';
import type { FeatureModelChoice } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type {
  IntentInputBundle,
  IntentOverrideInput,
  IntentRecord,
  PrIntent,
  ReviewIntentResult,
} from './domain/types.js';
import { deriveConfidence } from './domain/confidence.js';
import {
  canonicalIntentInput,
  formatIntentSkipped,
  formatIntentStep,
  renderIntentBlock,
  sanitizeClassification,
  toPrIntentDto,
} from './domain/render.js';
import {
  DEFAULT_INTENT_MODEL,
  INTENT_MAX_CHARS,
  INTENT_MAX_RETRIES,
  INTENT_MAX_TOKENS,
  INTENT_NEGATIVE_CACHE_TTL_MS,
  INTENT_SCHEMA_NAME,
  INTENT_TIMEOUT_MS,
  SCOPE_ITEM_MAX_CHARS,
  SCOPE_MAX_ITEMS,
} from './constants.js';
import { gatherIntentInput, type GatherDeps } from './gather.js';
import type { IntentLogCache, IntentLogger, IntentLogRecord, IntentPullContext } from './ports.js';
import { IntentClassification, buildIntentMessages } from './prompt.js';
import { NegativeCache, SingleFlight } from './single-flight.js';

export type IntentDeps = Pick<Container, 'intentRepo' | 'git' | 'github' | 'llm'>;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500);

const bodyHashOf = (ctx: IntentPullContext): string => sha256(`${ctx.title}\0${ctx.body ?? ''}`);

function cleanItems(items: readonly string[]): string[] {
  return items
    .map((s) => s.trim().slice(0, SCOPE_ITEM_MAX_CHARS))
    .filter((s) => s !== '')
    .slice(0, SCOPE_MAX_ITEMS);
}

type Computed =
  | { kind: 'record'; record: IntentRecord; cache: 'hit' | 'miss' }
  | { kind: 'recent_failure'; reason: string; retryInMs: number };

/** A real derivation failure (model call/parse) — the only kind that is negatively cached. */
class DeriveError extends Error {}

type IntentLlm = Awaited<ReturnType<IntentDeps['llm']>>;
type IntentModelChoice = FeatureModelChoice;
type Classified = {
  clean: ReturnType<typeof sanitizeClassification>;
  result: Awaited<ReturnType<IntentLlm['completeStructured']>>;
};

type LogFields = Omit<IntentLogRecord, 'event' | 'trigger' | 'prId' | 'latencyMs'>;
const NO_COST: LogFields = {
  outcome: 'skipped',
  cache: null,
  costUsd: null,
  tokensIn: 0,
  tokensOut: 0,
  provider: null,
  model: null,
  reason: null,
};

/**
 * Derives and caches PR intent. Concurrent `forReview` calls for one PR share a single in-flight
 * derivation (success or failure); a failure is remembered per (head_sha, input_hash) for a short
 * TTL so later runs skip intent at once. Both structures are in-memory (single API instance).
 */
export class IntentService {
  private readonly flights = new SingleFlight<Computed>();
  private readonly failures: NegativeCache;

  constructor(
    private readonly deps: IntentDeps,
    private readonly clock: () => number = Date.now,
  ) {
    this.failures = new NegativeCache(INTENT_NEGATIVE_CACHE_TTL_MS, clock);
  }

  async get(workspaceId: string, prId: string): Promise<PrIntent | null> {
    const ctx = await this.requireContext(workspaceId, prId);
    const record = await this.deps.intentRepo.get(prId);
    return record ? toPrIntentDto(record, this.current(ctx)) : null;
  }

  async refresh(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntent> {
    const t0 = this.clock();
    const ctx = await this.requireContext(workspaceId, prId);
    let dto: PrIntent;
    let fields: LogFields;
    let failure: string | undefined;
    try {
      const computed = await this.flights.runAfter(prId, () => this.compute(workspaceId, ctx, { force: true }));
      if (computed.kind !== 'record') throw new Error('unexpected negative-cache hit on refresh');
      const fresh = computed.record.usage;
      dto = toPrIntentDto(computed.record, this.current(ctx));
      fields = {
        outcome: 'ready',
        cache: 'miss',
        costUsd: fresh ? fresh.costUsd : null,
        tokensIn: fresh?.tokensIn ?? 0,
        tokensOut: fresh?.tokensOut ?? 0,
        provider: fresh?.provider ?? null,
        model: fresh?.model ?? null,
        reason: null,
      };
    } catch (e) {
      failure = errMessage(e);
      this.emit(logger, 'refresh', prId, t0, { ...NO_COST, outcome: 'failed', cache: 'miss', reason: failure });
      throw new ExternalServiceError(`Intent derivation failed: ${failure}`);
    }
    this.emit(logger, 'refresh', prId, t0, fields);
    return dto;
  }

  async setOverride(workspaceId: string, prId: string, input: IntentOverrideInput): Promise<PrIntent> {
    const ctx = await this.requireContext(workspaceId, prId);
    const intent = input.intent.trim().slice(0, INTENT_MAX_CHARS);
    if (intent === '') throw new ValidationError('Intent must not be blank');
    const record = await this.deps.intentRepo.setOverride(prId, {
      intent,
      inScope: cleanItems(input.in_scope),
      outOfScope: cleanItems(input.out_of_scope),
      headSha: ctx.headSha,
    });
    return toPrIntentDto(record, this.current(ctx));
  }

  async resetOverride(workspaceId: string, prId: string): Promise<PrIntent | null> {
    const ctx = await this.requireContext(workspaceId, prId);
    const record = await this.deps.intentRepo.clearOverride(prId);
    return record ? toPrIntentDto(record, this.current(ctx)) : null;
  }

  /** Best-effort: never throws. Skipped results let the review run without intent. */
  async forReview(workspaceId: string, prId: string, logger?: IntentLogger): Promise<ReviewIntentResult> {
    const t0 = this.clock();
    const { result, fields } = await this.reviewOutcome(workspaceId, prId);
    this.emit(logger, 'review', prId, t0, fields);
    return result;
  }

  // ---- internals ---------------------------------------------------------

  private current(ctx: IntentPullContext): { headSha: string; bodyHash: string } {
    return { headSha: ctx.headSha, bodyHash: bodyHashOf(ctx) };
  }

  private async requireContext(workspaceId: string, prId: string): Promise<IntentPullContext> {
    const ctx = await this.deps.intentRepo.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  /** One structured record per call. Fields carry ids, enums and numbers only, never intent text. */
  private emit(
    logger: IntentLogger | undefined,
    trigger: 'review' | 'refresh',
    prId: string,
    t0: number,
    fields: LogFields,
  ): void {
    if (!logger) return;
    const record: IntentLogRecord = { event: 'intent', trigger, prId, latencyMs: this.clock() - t0, ...fields };
    try {
      if (fields.outcome === 'ready') logger.info(record, 'intent: ready');
      else logger.warn(record, fields.outcome === 'failed' ? 'intent: failed' : 'intent: skipped');
    } catch {
      // a broken log sink must never affect the review
    }
  }

  private async reviewOutcome(
    workspaceId: string,
    prId: string,
  ): Promise<{ result: ReviewIntentResult; fields: LogFields }> {
    const skipped = (
      reason: string,
      extra: Partial<LogFields> = {},
    ): { result: ReviewIntentResult; fields: LogFields } => ({
      result: { status: 'skipped', reason, logLine: formatIntentSkipped(reason) },
      fields: { ...NO_COST, ...extra, outcome: 'skipped', reason },
    });
    let joined = false;
    try {
      const ctx = await this.deps.intentRepo.getPullContext(workspaceId, prId);
      if (!ctx) return skipped('pull request not found');
      const cur = this.current(ctx);

      let record: IntentRecord;
      let cache: 'hit' | 'miss' | 'override';
      const existing = await this.deps.intentRepo.get(prId);
      if (existing?.override) {
        record = existing;
        cache = 'override';
      } else {
        const flight = this.flights.run(prId, () => this.compute(workspaceId, ctx, { force: false }));
        joined = flight.joined;
        const computed = await flight.promise;
        if (computed.kind === 'recent_failure') {
          return skipped(
            `recent failure (retry in ${Math.ceil(computed.retryInMs / 1000)}s): ${computed.reason}`,
            { cache: 'negative' },
          );
        }
        record = computed.record;
        cache = computed.cache;
      }

      // Only the caller that paid for the model call reports its tokens/cost.
      const paid = cache === 'miss' && !joined ? record.usage : null;
      const logCache: IntentLogCache = cache === 'override' ? 'override' : joined ? 'joined' : cache;
      const base: Partial<LogFields> = {
        cache: logCache,
        costUsd: paid ? paid.costUsd : null,
        tokensIn: paid?.tokensIn ?? 0,
        tokensOut: paid?.tokensOut ?? 0,
        provider: cache === 'override' ? null : (record.usage?.provider ?? null),
        model: cache === 'override' ? null : (record.usage?.model ?? null),
      };
      const block = renderIntentBlock(record, { headSha: ctx.headSha });
      if (block === null) return skipped('no intent text', base);

      const dto = toPrIntentDto(record, cur);
      const step = {
        cache: joined && cache === 'miss' ? ('hit' as const) : cache,
        origin: dto.origin,
        confidence: record.confidence,
        stale: dto.stale,
        sourceRefs: record.sources.filter((s) => s.used).map((s) => s.ref),
        provider: record.usage?.provider ?? null,
        model: record.usage?.model ?? null,
        tokensIn: paid?.tokensIn ?? 0,
        tokensOut: paid?.tokensOut ?? 0,
        costUsd: paid ? paid.costUsd : null,
      };
      return {
        result: { status: 'ready', block, step, logLine: formatIntentStep(step) },
        fields: { ...NO_COST, ...base, outcome: 'ready', reason: null },
      };
    } catch (e) {
      const failedCache: IntentLogCache | null = joined ? 'joined' : e instanceof DeriveError ? 'miss' : null;
      return skipped(errMessage(e), { cache: failedCache });
    }
  }

  private async compute(workspaceId: string, ctx: IntentPullContext, opts: { force: boolean }): Promise<Computed> {
    const repo = this.deps.intentRepo;
    const gatherDeps: GatherDeps = {
      repo,
      git: this.deps.git,
      github: () => this.deps.github(),
    };
    const bundle = await gatherIntentInput(gatherDeps, ctx);
    const choice = (await repo.featureModelOverride(workspaceId)) ?? DEFAULT_INTENT_MODEL;
    const bodyHash = bodyHashOf(ctx);
    const inputHash = sha256(canonicalIntentInput(bundle, choice));

    if (!opts.force) {
      const existing = await repo.get(ctx.prId);
      if (
        existing?.status === 'ok' &&
        existing.headSha === ctx.headSha &&
        existing.inputHash === inputHash &&
        existing.bodyHash === bodyHash
      ) {
        return { kind: 'record', record: existing, cache: 'hit' };
      }
      const recent = this.failures.get(ctx.prId, { headSha: ctx.headSha, inputHash });
      if (recent) return { kind: 'recent_failure', reason: recent.reason, retryInMs: recent.retryInMs };
    }

    // Provider resolution and the saveDerived write are NOT derivation failures: their errors propagate
    // unchanged and are never negatively cached (a transient config/DB error must not block intent for the TTL).
    const llm = await this.deps.llm(choice.provider);
    let classified: Classified;
    try {
      classified = await this.classify(llm, ctx, bundle, choice);
    } catch (e) {
      const reason = errMessage(e);
      // In-memory entry first: it must not depend on the best-effort DB write below.
      this.failures.set(ctx.prId, { headSha: ctx.headSha, inputHash, reason });
      try {
        await repo.saveFailure(ctx.prId, {
          error: reason,
          sources: bundle.sources,
          headSha: ctx.headSha,
          inputHash,
          bodyHash,
          usage: null,
        });
      } catch {
        // best-effort: the original error is what the caller needs
      }
      throw new DeriveError(reason, { cause: e });
    }
    const record = await this.persistDerived(ctx, bundle, choice, classified, inputHash, bodyHash);
    this.failures.delete(ctx.prId);
    return { kind: 'record', record, cache: 'miss' };
  }

  /** The model call + parsing/sanitizing: the only step whose failure is a DeriveError. */
  private async classify(
    llm: IntentLlm,
    ctx: IntentPullContext,
    bundle: IntentInputBundle,
    choice: IntentModelChoice,
  ): Promise<Classified> {
    const result = await llm.completeStructured({
      model: choice.model,
      schema: IntentClassification,
      schemaName: INTENT_SCHEMA_NAME,
      messages: buildIntentMessages({ number: ctx.number, fullName: ctx.fullName }, bundle.offered),
      temperature: 0,
      maxTokens: INTENT_MAX_TOKENS,
      timeoutMs: INTENT_TIMEOUT_MS,
      maxRetries: INTENT_MAX_RETRIES,
    });
    const clean = sanitizeClassification(result.data, bundle.offered.map((o) => o.id));
    if (clean.derived.intent === '') throw new Error('the model returned an empty intent');
    return { clean, result };
  }

  private async persistDerived(
    ctx: IntentPullContext,
    bundle: IntentInputBundle,
    choice: IntentModelChoice,
    { clean, result }: Classified,
    inputHash: string,
    bodyHash: string,
  ): Promise<IntentRecord> {
    const cited = new Set(clean.citedIds);
    const sources = bundle.sources.map((s) => ({ ...s, cited: s.used && cited.has(s.id) }));
    const conf = deriveConfidence({
      body: bundle.bodyQuality,
      sources,
      sourcesConflict: clean.sourcesConflict,
    });
    return this.deps.intentRepo.saveDerived(ctx.prId, {
      derived: clean.derived,
      kind: clean.kind,
      confidence: conf.confidence,
      confidenceReason: conf.reason,
      confidenceLowered: conf.lowered,
      sources,
      headSha: ctx.headSha,
      inputHash,
      bodyHash,
      usage: {
        provider: choice.provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      },
    });
  }
}
