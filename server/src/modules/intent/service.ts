import { randomUUID } from 'node:crypto';
import { promptFingerprint } from '@devdigest/reviewer-core';
import { IntentDerivation, type PrIntentResponse } from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { logPromptAssembly } from '../../platform/prompt-log.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { collectSources } from './collect.js';
import { computeConfidence } from './confidence.js';
import { INTENT_MAX_TOKENS, INTENT_MODEL_DEADLINE_MS, INTENT_MODEL_TIMEOUT_MS, MAX_BODY_CHARS } from './constants.js';
import { normalizeDerivation, sourceHash, textHash, toPrIntentRecord } from './helpers.js';
import { renderDerivationPrompt, renderIntentBlock } from './render.js';
import type { IntentDeps, IntentPullRecord, ReviewIntentResolution, StoredIntent } from './types.js';

/**
 * Intent use cases: derive a PR's intent from its own text (or indirect data),
 * cache it by a content hash, and hand a pre-rendered, untrusted block to the
 * review pipeline. No route or service outside this module ever touches
 * `pr_intent` — everything goes through `getForPull` / `derive` / `resolveForReview`.
 */
export class IntentService {
  constructor(private deps: IntentDeps) {}

  /** GET .../intent — never calls a model. */
  async getForPull(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.deps.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const stored = await this.deps.intentRepo.get(prId);
    if (!stored) return { intent: null };
    return { intent: toPrIntentRecord(stored, this.isStale(stored, pull)) };
  }

  /** POST .../intent/derive — force mode, always calls the model. */
  async derive(workspaceId: string, prId: string, correlationId?: string): Promise<PrIntentResponse> {
    try {
      const { stored, pull } = await this.run(workspaceId, prId, 'force', correlationId);
      return { intent: toPrIntentRecord(stored, this.isStale(stored, pull)) };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof TimeoutError) {
        throw new ExternalServiceError('The intent model timed out.');
      }
      throw new ExternalServiceError(
        err instanceof Error ? err.message : 'The intent derivation failed.',
      );
    }
  }

  /**
   * Review pre-work — review mode, cache-first, NEVER throws: every failure
   * becomes `{status:'unavailable', reason}` so a review always completes.
   */
  async resolveForReview(
    workspaceId: string,
    prId: string,
    opts: { correlationId?: string } = {},
  ): Promise<ReviewIntentResolution> {
    try {
      const { stored, cache } = await this.run(workspaceId, prId, 'review', opts.correlationId);
      const used = stored.sources.filter((s) => s.status !== 'unresolved').map((s) => s.ref);
      const unresolved = stored.sources.filter((s) => s.status === 'unresolved').map((s) => s.ref);
      return {
        status: 'ready',
        promptBlock: renderIntentBlock(stored),
        confidence: stored.confidence,
        cache,
        provider: stored.provider,
        model: stored.model,
        tokensIn: stored.tokensIn,
        tokensOut: stored.tokensOut,
        costUsd: stored.costUsd,
        sourcesUsed: used,
        sourcesUnresolved: unresolved,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Intent derivation failed';
      return { status: 'unavailable', reason };
    }
  }

  private isStale(stored: StoredIntent, pull: IntentPullRecord): boolean {
    if (!stored.headSha || stored.headSha !== pull.headSha) return true;
    const expected = textHash(pull.title, (pull.body ?? '').slice(0, MAX_BODY_CHARS));
    return stored.textHash !== expected;
  }

  /**
   * Shared derivation path. `mode: 'review'` reuses a cache hit or, when the
   * collection is degraded (a transient GitHub/clone outage) and a stored
   * intent already exists, reuses that rather than overwriting a good intent
   * with a worse one. `mode: 'force'` (the Derive button) always re-derives.
   */
  private async run(
    workspaceId: string,
    prId: string,
    mode: 'force' | 'review',
    correlationId: string = randomUUID(),
  ): Promise<{ stored: StoredIntent; cache: 'hit' | 'miss'; pull: IntentPullRecord }> {
    const pull = await this.deps.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repoRepo.getById(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const repoRef = { owner: repo.owner, name: repo.name };

    const choice = await resolveFeatureModel(this.deps, workspaceId, 'review_intent');

    const [files, commits] = await Promise.all([
      this.deps.pullsRepo.listFiles(prId),
      this.deps.pullsRepo.listCommits(prId),
    ]);

    const collected = await collectSources(this.deps, { pull, repo: repoRef, files, commits });
    const confidence = computeConfidence(collected);
    const system = await loadPromptTemplate('intent.system.md');

    const hash = sourceHash({
      systemTemplate: system,
      provider: choice.provider,
      model: choice.model,
      title: collected.title,
      body: collected.body,
      docs: collected.docs.map((d) => ({ path: d.path, content: d.content })),
      issues: collected.issues.map((i) => ({ number: i.number, title: i.title, body: i.body })),
      branch: collected.indirect.branch,
      commitSubjects: collected.indirect.commitSubjects,
      files: collected.indirect.files,
      labels: collected.indirect.labels,
      unresolved: collected.sources.filter((s) => s.status === 'unresolved'),
    });

    const existing = await this.deps.intentRepo.get(prId);

    if (mode === 'review') {
      if (existing && existing.sourceHash === hash) {
        await this.deps.intentRepo.touchHeadSha(prId, pull.headSha);
        return { stored: { ...existing, headSha: pull.headSha }, cache: 'hit', pull };
      }
      if (collected.degraded && existing) {
        return { stored: existing, cache: 'hit', pull };
      }
    }

    let llm;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          'intent_model_unavailable',
          `${choice.provider} API key is not configured — add it under Settings → API Keys or pick another model in Settings → Models`,
          400,
        );
      }
      throw err;
    }

    const user = renderDerivationPrompt(collected, pull);
    logPromptAssembly(
      this.deps.promptLog(),
      {
        purpose: 'intent',
        correlationId,
        prId,
        provider: choice.provider,
        model: choice.model,
      },
      [
        {
          name: 'system',
          source: 'prompt:intent.system.md',
          wrapped: false,
          chars: system.length,
          fingerprint: promptFingerprint(system),
        },
        ...user.sections,
      ],
    );

    const result = await withTimeout(
      llm.completeStructured({
        model: choice.model,
        schema: IntentDerivation,
        schemaName: 'IntentDerivation',
        temperature: 0,
        maxRetries: 1,
        timeoutMs: INTENT_MODEL_TIMEOUT_MS,
        maxTokens: INTENT_MAX_TOKENS,
        sessionId: `intent:${repo.owner}/${repo.name}#${pull.number}`,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user.text },
        ],
      }),
      INTENT_MODEL_DEADLINE_MS,
    );

    const normalized = normalizeDerivation(result.data);
    const stored: StoredIntent = {
      prId,
      intent: normalized.intent,
      inScope: normalized.in_scope,
      outOfScope: normalized.out_of_scope,
      riskAreas: normalized.risk_areas,
      confidence,
      sources: collected.sources,
      sourceHash: hash,
      textHash: textHash(pull.title, collected.body),
      headSha: pull.headSha,
      provider: choice.provider,
      model: choice.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      derivedAt: new Date().toISOString(),
    };
    await this.deps.intentRepo.upsert(stored);
    return { stored, cache: 'miss', pull };
  }
}
