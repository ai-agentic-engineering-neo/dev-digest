/**
 * IntentModel over the workspace's `review_intent` feature model (Settings →
 * Feature models) and the container's LLM providers. Split into `resolve`
 * (cheap — needed BEFORE the cache key) and `classify` (the actual call).
 */
import type { ChatMessage, FeatureModelChoice, LLMProvider, Provider } from '@devdigest/shared';
import type { ClassifyResult, IntentModel, ResolvedModel } from '../application/ports.js';
import { IntentClassification } from '../domain/classification.js';
import { INTENT_CLASSIFICATION_SCHEMA_NAME, LLM_MAX_OUTPUT_TOKENS, LLM_MAX_RETRIES } from '../domain/constants.js';

export interface LlmIntentModelDeps {
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: Provider) => Promise<LLMProvider>;
}

export class LlmIntentModel implements IntentModel {
  constructor(private readonly deps: LlmIntentModelDeps) {}

  async resolve(workspaceId: string): Promise<ResolvedModel> {
    const choice = await this.deps.resolveModel(workspaceId);
    return { provider: choice.provider, model: choice.model };
  }

  async classify(resolved: ResolvedModel, messages: ChatMessage[], signal: AbortSignal): Promise<ClassifyResult> {
    const llm = await this.deps.llm(resolved.provider);
    const res = await llm.completeStructured({
      model: resolved.model,
      schema: IntentClassification,
      schemaName: INTENT_CLASSIFICATION_SCHEMA_NAME,
      messages,
      temperature: 0,
      maxTokens: LLM_MAX_OUTPUT_TOKENS,
      maxRetries: LLM_MAX_RETRIES,
      signal,
    });
    return { data: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd };
  }
}
