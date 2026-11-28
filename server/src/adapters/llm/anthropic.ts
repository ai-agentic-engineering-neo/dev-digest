import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  ChatMessage,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair, StructuredOutputError } from '../../platform/structured.js';
import { estimateCost } from './pricing.js';
import { ExternalServiceError } from '../../platform/errors.js';

/** Per-request deadline; the SDK aborts the request when it passes. */
const DEFAULT_TIMEOUT = 60_000;
/** SDK retries (timeout, connection error, 408/409/429/5xx), with its own backoff. */
const SDK_MAX_RETRIES = 2;
const DEFAULT_MAX_TOKENS = 4096;

/** Anthropic has no embeddings API; embeddings come from the OpenAI Embedder. */
function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: Anthropic.MessageParam[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, rest };
}

/**
 * Anthropic LLMProvider.
 * - listModels: dynamic via GET /models.
 * - completeStructured: FORCED tool-use (single tool, input_schema = our JSON
 *   schema, tool_choice forces it), parse tool_use.input, Zod validate + reprompt.
 * - embed: NOT supported (throws) — use the OpenAI Embedder for vectors.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  /** `client` lets tests inject a fake; by default the SDK client owns timeout and retries. */
  constructor(apiKey: string, client?: Anthropic) {
    this.client =
      client ?? new Anthropic({ apiKey, timeout: DEFAULT_TIMEOUT, maxRetries: SDK_MAX_RETRIES });
  }

  async listModels(): Promise<ModelInfo[]> {
    // SDK 0.33 exposes models.list()
    const res = await this.client.models.list();
    return res.data.map((m) => ({
      id: m.id,
      provider: 'anthropic' as const,
      label: m.display_name,
    }));
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const res = await this.client.messages.create(
      {
        model: req.model,
        system: system || undefined,
        messages: rest,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: req.temperature ?? 0.2,
      },
      req.timeoutMs ? { timeout: req.timeoutMs } : {},
    );
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: estimateCost(req.model, tokensIn, tokensOut),
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const toolName = req.schemaName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const maxRetries = req.maxRetries ?? 2;
    const { system, rest } = splitSystem(req.messages);
    const messages: Anthropic.MessageParam[] = [...rest];
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await this.client.messages.create(
        {
          model: req.model,
          system: system || undefined,
          messages,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: req.temperature ?? 0,
          tools: [
            {
              name: toolName,
              description: `Return the result as ${req.schemaName}.`,
              input_schema: jsonSchema.schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: 'tool', name: toolName },
        },
        {
          ...(req.timeoutMs ? { timeout: req.timeoutMs } : {}),
          ...(req.signal ? { signal: req.signal } : {}),
        },
      );
      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      const toolUse = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      lastRaw = toolUse ? JSON.stringify(toolUse.input) : '';

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: estimateCost(req.model, tokensIn, tokensOut),
          raw: lastRaw,
          attempts: attempt,
        };
      }
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: parsed.repromptMessage,
      });
    }

    throw new StructuredOutputError(
      'Anthropic structured output failed schema validation',
      { tokensIn, tokensOut, costUsd: estimateCost(req.model, tokensIn, tokensOut) },
      lastRaw,
      maxRetries + 1,
    );
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError(
      'Anthropic does not provide embeddings; use the OpenAI Embedder.',
    );
  }
}
