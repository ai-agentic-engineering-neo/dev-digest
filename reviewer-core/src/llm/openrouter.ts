import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  LlmUsage,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair, truncate } from './structured.js';
import { addCost, emitUsage, estimateTokens } from './usage.js';
import { createCallBudget } from './budget.js';
import { temperatureParam } from './model-params.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

/** Default per-request SDK timeout (one HTTP attempt). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
/** Default wall-clock budget for ONE completeStructured call, all retries included. */
export const DEFAULT_CALL_BUDGET_MS = 180_000;
/** Default timeout for the `/models` listing fetch. */
export const DEFAULT_LIST_MODELS_TIMEOUT_MS = 15_000;
/** Diagnostic snippet sizes for the final schema-failure error. */
const ISSUES_SNIPPET = 600;
const RAW_SNIPPET = 400;

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /**
   * Per-request (one HTTP attempt) timeout, ms — the SDK retries on
   * timeout/5xx/429 with backoff. Capped by the remaining call budget.
   */
  timeoutMs?: number;
  /** SDK transport retries per request (they consume the call budget). */
  maxRetries?: number;
  /**
   * Total wall-clock budget for one completeStructured call — SDK retries AND
   * schema reprompts included (default 180s). Exceeding it throws
   * CallBudgetExceededError.
   */
  totalTimeoutMs?: number;
  /** Timeout for the `/models` listing fetch (default 15s). */
  listModelsTimeoutMs?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  /** Non-fatal anomalies (e.g. a response without `usage`). Errors are swallowed. */
  onWarning?: (message: string) => void;
  /** Monotonic clock for the call budget (tests); defaults to performance.now. */
  now?: () => number;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private opts: OpenRouterProviderOptions;

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.opts = opts;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const requestTimeout = req.timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const budget = createCallBudget({
      totalMs: this.opts.totalTimeoutMs ?? DEFAULT_CALL_BUDGET_MS,
      label: `OpenRouter structured call for ${req.schemaName}`,
      ...(req.signal ? { signal: req.signal } : {}),
      ...(this.opts.now ? { now: this.opts.now } : {}),
    });
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd: number | null = 0;
    let lastRaw = '';
    let lastError = '';
    let attempt = 0;

    while (attempt <= maxRetries) {
      budget.throwIfDone();
      attempt++;
      const res = await this.client.chat.completions
        .create(
          {
            model: req.model,
            messages,
            ...temperatureParam(req.model, req.temperature),
            ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
            },
            // OpenRouter session grouping — extra body field (spread is exempt from
            // excess-property checks). Only sent when talking to OpenRouter.
            ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
            // OpenRouter usage accounting — ask it to return the REAL generation
            // cost (USD) in `usage.cost`, instead of estimating from a price book.
            ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
          },
          // One signal = caller cancel OR call deadline; the SDK re-checks it
          // before each of its own retries, so those draw from the same budget.
          { signal: budget.signal, timeout: Math.max(1, Math.min(requestTimeout, budget.remaining())) },
        )
        .catch((e: unknown) => {
          throw budget.translate(e);
        });

      // OpenRouter can return HTTP 200 with no `choices` (an upstream provider
      // error / moderation / free-tier limit in the body) — surface it.
      const choice = res.choices?.[0];
      lastRaw = choice?.message?.content ?? '';

      // Per-attempt usage, reported BEFORE parsing/guards so a call that
      // ultimately throws still accounts for what it spent.
      const usage = this.attemptUsage(req, messages, res, lastRaw);
      tokensIn += usage.tokensIn;
      tokensOut += usage.tokensOut;
      costUsd = addCost(costUsd, usage.costUsd);
      emitUsage(req.onUsage, usage);

      if (!choice) {
        const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`);
      }

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      lastError = parsed.error;
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new Error(
      `OpenRouter structured output failed schema validation for ${req.schemaName} after ${attempt} attempt(s). ` +
        `Last issues:\n${truncate(lastError, ISSUES_SNIPPET)}\n` +
        `Last raw output (${lastRaw.length} chars): ${truncate(lastRaw, RAW_SNIPPET)}`,
    );
  }

  /**
   * Usage of ONE response. `usage.cost` is an OpenRouter extension (the REAL
   * generation cost, USD) absent from the SDK type; otherwise the injected
   * estimator prices the tokens. A response WITHOUT `usage` is not booked as
   * 0 tokens: tokens are estimated from the text and a warning is raised.
   */
  private attemptUsage(
    req: StructuredRequest<unknown>,
    messages: StructuredRequest<unknown>['messages'],
    res: { usage?: { prompt_tokens?: number; completion_tokens?: number } | null },
    output: string,
  ): LlmUsage {
    let tokensIn: number;
    let tokensOut: number;
    if (res.usage) {
      tokensIn = res.usage.prompt_tokens ?? 0;
      tokensOut = res.usage.completion_tokens ?? 0;
    } else {
      tokensIn = estimateTokens(messages.map((m) => m.content).join('\n'));
      tokensOut = estimateTokens(output);
      this.warn(
        `${req.model} returned no usage for ${req.schemaName}; estimated ${tokensIn} in / ${tokensOut} out tokens`,
      );
    }
    const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;
    const costUsd =
      typeof apiCost === 'number' ? apiCost : (this.opts.estimateCost?.(req.model, tokensIn, tokensOut) ?? null);
    return { tokensIn, tokensOut, costUsd };
  }

  private warn(message: string): void {
    try {
      this.opts.onWarning?.(message);
    } catch {
      // observational only
    }
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.opts.listModelsTimeoutMs ?? DEFAULT_LIST_MODELS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(NOT_SUPPORTED);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
