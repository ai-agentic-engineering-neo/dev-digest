/**
 * ConventionModel over the workspace's `conventions` feature model (Settings →
 * Feature models) and the container's LLM providers.
 */
import type { FeatureModelChoice, LLMProvider, Provider } from '@devdigest/shared';
import type { ConventionModel } from '../application/ports.js';
import { LLM_MAX_OUTPUT_TOKENS, LLM_TIMEOUT_MS } from '../domain/constants.js';
import { ConventionExtraction, EXTRACTION_SCHEMA_NAME } from '../domain/extraction.js';

export interface LlmConventionModelDeps {
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: Provider) => Promise<LLMProvider>;
}

export class LlmConventionModel implements ConventionModel {
  constructor(private readonly deps: LlmConventionModelDeps) {}

  async propose(
    workspaceId: string,
    messages: Parameters<ConventionModel['propose']>[1],
    signal: AbortSignal,
    onResolved?: Parameters<ConventionModel['propose']>[3],
  ) {
    const choice = await this.deps.resolveModel(workspaceId);
    onResolved?.({ provider: choice.provider, model: choice.model });
    const llm = await this.deps.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages,
      temperature: 0.1,
      maxTokens: LLM_MAX_OUTPUT_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
      maxRetries: 1,
      signal,
    });
    return {
      data: res.data,
      model: res.model,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
    };
  }
}
