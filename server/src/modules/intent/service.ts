import { createHash } from 'node:crypto';
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
  INTENT_SCHEMA_NAME,
  INTENT_TIMEOUT_MS,
  SCOPE_ITEM_MAX_CHARS,
  SCOPE_MAX_ITEMS,
} from './constants.js';
import { gatherIntentInput, type GatherDeps } from './gather.js';
import type { IntentPullContext } from './ports.js';
import { IntentClassification, buildIntentMessages } from './prompt.js';

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

interface Computed {
  record: IntentRecord;
  cache: 'hit' | 'miss';
}

export class IntentService {
  /** Single-flight per PR: derivations for one prId run one at a time. */
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: IntentDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntent | null> {
    const ctx = await this.requireContext(workspaceId, prId);
    const record = await this.deps.intentRepo.get(prId);
    return record ? toPrIntentDto(record, this.current(ctx)) : null;
  }

  async refresh(workspaceId: string, prId: string): Promise<PrIntent> {
    const ctx = await this.requireContext(workspaceId, prId);
    const { record } = await this.exclusive(prId, () => this.compute(workspaceId, ctx, true)).catch((e: unknown) => {
      throw new ExternalServiceError(`Intent derivation failed: ${errMessage(e)}`);
    });
    return toPrIntentDto(record, this.current(ctx));
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
  async forReview(workspaceId: string, prId: string): Promise<ReviewIntentResult> {
    const skipped = (reason: string): ReviewIntentResult => ({
      status: 'skipped',
      reason,
      logLine: formatIntentSkipped(reason),
    });
    try {
      const ctx = await this.deps.intentRepo.getPullContext(workspaceId, prId);
      if (!ctx) return skipped('pull request not found');
      const cur = this.current(ctx);

      return await this.exclusive(prId, async (): Promise<ReviewIntentResult> => {
        const existing = await this.deps.intentRepo.get(prId);
        let record: IntentRecord;
        let cache: 'hit' | 'miss' | 'override';
        if (existing?.override) {
          record = existing;
          cache = 'override';
        } else {
          const computed = await this.compute(workspaceId, ctx, false);
          record = computed.record;
          cache = computed.cache;
        }
        const block = renderIntentBlock(record, { headSha: ctx.headSha });
        if (block === null) return skipped('no intent text');
        const dto = toPrIntentDto(record, cur);
        const fresh = cache === 'miss' ? record.usage : null;
        const step = {
          cache,
          origin: dto.origin,
          confidence: record.confidence,
          stale: dto.stale,
          sourceRefs: record.sources.filter((s) => s.used).map((s) => s.ref),
          provider: record.usage?.provider ?? null,
          model: record.usage?.model ?? null,
          tokensIn: fresh?.tokensIn ?? 0,
          tokensOut: fresh?.tokensOut ?? 0,
          costUsd: fresh ? fresh.costUsd : null,
        };
        return { status: 'ready', block, step, logLine: formatIntentStep(step) };
      });
    } catch (e) {
      return skipped(errMessage(e));
    }
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

  /** Waits for any in-flight work on this PR, then registers `fn` as the in-flight work. */
  private async exclusive<T>(prId: string, fn: () => Promise<T>): Promise<T> {
    for (let existing = this.inFlight.get(prId); existing; existing = this.inFlight.get(prId)) {
      await existing.catch(() => undefined);
    }
    const promise = fn();
    this.inFlight.set(prId, promise);
    try {
      return await promise;
    } finally {
      if (this.inFlight.get(prId) === promise) this.inFlight.delete(prId);
    }
  }

  private async compute(workspaceId: string, ctx: IntentPullContext, force: boolean): Promise<Computed> {
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

    const existing = await repo.get(ctx.prId);
    if (
      !force &&
      existing?.status === 'ok' &&
      existing.headSha === ctx.headSha &&
      existing.inputHash === inputHash &&
      existing.bodyHash === bodyHash
    ) {
      return { record: existing, cache: 'hit' };
    }

    try {
      return { record: await this.derive(ctx, bundle, choice, inputHash, bodyHash), cache: 'miss' };
    } catch (e) {
      try {
        await repo.saveFailure(ctx.prId, {
          error: errMessage(e),
          sources: bundle.sources,
          headSha: ctx.headSha,
          inputHash,
          bodyHash,
          usage: null,
        });
      } catch {
        // best-effort: the original error is what the caller needs
      }
      throw e;
    }
  }

  private async derive(
    ctx: IntentPullContext,
    bundle: IntentInputBundle,
    choice: { provider: 'openai' | 'anthropic' | 'openrouter'; model: string },
    inputHash: string,
    bodyHash: string,
  ): Promise<IntentRecord> {
    const llm = await this.deps.llm(choice.provider);
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
