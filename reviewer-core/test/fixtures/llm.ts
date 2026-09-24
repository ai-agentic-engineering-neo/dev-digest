import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';

/**
 * Minimal scriptable LLM stub — the reviewer-core replacement for the server's
 * MockLLMProvider. `respond` decides the structured payload per call (defaults
 * to `data`); every call is recorded in `calls` and reports usage via onUsage.
 */
export interface StubLlmOptions {
  data?: unknown;
  respond?: (req: StructuredRequest<unknown>, callIndex: number) => unknown | Promise<unknown>;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number | null };
}

export class StubLLM implements LLMProvider {
  readonly id = 'openai' as const;
  readonly calls: StructuredRequest<unknown>[] = [];

  constructor(private opts: StubLlmOptions = {}) {}

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const i = this.calls.length;
    this.calls.push(req as StructuredRequest<unknown>);
    const usage = this.opts.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 };
    req.onUsage?.(usage);
    const payload = this.opts.respond
      ? await this.opts.respond(req as StructuredRequest<unknown>, i)
      : this.opts.data;
    return {
      data: req.schema.parse(payload),
      model: req.model,
      ...usage,
      raw: JSON.stringify(payload),
      attempts: 1,
    };
  }
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('StubLLM: complete not used');
  }
  async embed() {
    return [];
  }
}
