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
import { withRetry } from '../../platform/resilience.js';
import { toJsonSchema, parseWithRepair } from '../../platform/structured.js';
import { emitUsage } from '@devdigest/reviewer-core';
import { estimateCost } from './pricing.js';
import { ExternalServiceError } from '../../platform/errors.js';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  budgetedRequest,
  schemaFailure,
  startBudget,
  usageOrEstimate,
  warnWith,
  type LlmAdapterOptions,
} from './call.js';

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

type MessageUsage = { input_tokens?: number | null; output_tokens?: number | null } | null | undefined;

function reportedUsage(usage: MessageUsage): { tokensIn: number; tokensOut: number } | null {
  return usage ? { tokensIn: usage.input_tokens ?? 0, tokensOut: usage.output_tokens ?? 0 } : null;
}

/**
 * Anthropic LLMProvider.
 * - listModels: dynamic via GET /models.
 * - complete / completeStructured: one call budget (./call.ts) over SDK
 *   retries + reprompts, honouring the caller's AbortSignal.
 * - completeStructured: FORCED tool-use (single tool, input_schema = our JSON
 *   schema, tool_choice forces it), parse tool_use.input, Zod validate + reprompt.
 * - embed: NOT supported (throws) — use the OpenAI Embedder for vectors.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;
  private readonly warn: (message: string) => void;

  constructor(
    apiKey: string,
    private readonly opts: LlmAdapterOptions = {},
  ) {
    this.client = new Anthropic({ apiKey });
    this.warn = warnWith(opts);
  }

  async listModels(): Promise<ModelInfo[]> {
    return withRetry(async () => {
      // SDK 0.33 exposes models.list()
      const res = await this.client.models.list();
      return res.data.map((m) => ({
        id: m.id,
        provider: 'anthropic' as const,
        label: m.display_name,
      }));
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const budget = startBudget(this.opts, `Anthropic completion (${req.model})`, req.signal);
    const res = await budgetedRequest(budget, req.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, (options) =>
      this.client.messages.create(
        {
          model: req.model,
          system: system || undefined,
          messages: rest,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: req.temperature ?? 0.2,
        },
        options,
      ),
    );
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const { tokensIn, tokensOut } = usageOrEstimate(
      reportedUsage(res.usage),
      { system, messages: req.messages.filter((m) => m.role !== 'system'), output: text },
      this.warn,
      `${req.model} completion`,
    );
    return { text, model: req.model, tokensIn, tokensOut, costUsd: estimateCost(req.model, tokensIn, tokensOut) };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const toolName = req.schemaName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const maxRetries = req.maxRetries ?? 2;
    const requestTimeout = req.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const budget = startBudget(this.opts, `Anthropic structured call for ${req.schemaName}`, req.signal);
    const { system, rest } = splitSystem(req.messages);
    const messages: Anthropic.MessageParam[] = [...rest];
    // Text view of the conversation, for estimating usage when none is reported.
    const transcript: ChatMessage[] = req.messages.filter((m) => m.role !== 'system');
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';
    let lastIssues = '';
    let attempt = 0;

    while (attempt <= maxRetries) {
      budget.throwIfDone();
      attempt++;
      const res = await budgetedRequest(budget, requestTimeout, (options) =>
        this.client.messages.create(
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
          options,
        ),
      );
      const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      lastRaw = toolUse ? JSON.stringify(toolUse.input) : '';

      const usage = usageOrEstimate(
        reportedUsage(res.usage),
        { system, messages: transcript, output: lastRaw },
        this.warn,
        `${req.model} (${req.schemaName})`,
      );
      tokensIn += usage.tokensIn;
      tokensOut += usage.tokensOut;
      // Per-attempt usage BEFORE parsing, so spend is accounted even if every
      // attempt fails validation and we throw below.
      emitUsage(req.onUsage, { ...usage, costUsd: estimateCost(req.model, usage.tokensIn, usage.tokensOut) });

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
      lastIssues = parsed.error;
      messages.push({ role: 'assistant', content: res.content });
      messages.push({ role: 'user', content: parsed.repromptMessage });
      transcript.push({ role: 'assistant', content: lastRaw }, { role: 'user', content: parsed.repromptMessage });
    }

    throw schemaFailure('Anthropic', req.schemaName, attempt, lastIssues, lastRaw);
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError(
      'Anthropic does not provide embeddings; use the OpenAI Embedder.',
    );
  }
}
