/**
 * Shared plumbing of the server's OpenAI / Anthropic adapters — the same rules
 * reviewer-core's OpenRouter provider follows (it exports the primitives):
 *
 * - ONE wall-clock budget per call (`createCallBudget`) shared by every request
 *   it makes — SDK transport retries, `withRetry` retries AND schema reprompts —
 *   so a call can no longer spend `retries × reprompts × timeout`. The budget's
 *   signal also fires on the caller's AbortSignal (run cancel).
 * - A response WITHOUT usage is estimated (~4 chars/token) and warned about,
 *   never silently booked as 0 tokens.
 * - The final schema failure names the last validation issues and a truncated
 *   raw output, so the run trace says why.
 */
import type { ChatMessage } from '@devdigest/shared';
import {
  CallBudgetExceededError,
  createCallBudget,
  estimateTokens,
  truncate,
  type CallBudget,
} from '@devdigest/reviewer-core';
import { isTransient, withRetry } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';

/** Per-request (one HTTP attempt) timeout when the caller sets none. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
/** Wall-clock budget of one call, all retries and reprompts included. */
export const DEFAULT_CALL_BUDGET_MS = 180_000;
const ISSUES_SNIPPET = 600;
const RAW_SNIPPET = 400;

export interface LlmAdapterOptions {
  /** Total budget of one complete/completeStructured call (default 180s). */
  totalTimeoutMs?: number;
  /** Non-fatal anomalies (e.g. a response without usage). Defaults to a process warning. */
  onWarning?: (message: string) => void;
  /** Monotonic clock for the budget (tests); defaults to performance.now. */
  now?: () => number;
}

export function startBudget(opts: LlmAdapterOptions, label: string, signal?: AbortSignal): CallBudget {
  return createCallBudget({
    totalMs: opts.totalTimeoutMs ?? DEFAULT_CALL_BUDGET_MS,
    label,
    ...(signal ? { signal } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });
}

/**
 * One budgeted request: `send` gets the budget's signal and a per-request
 * timeout capped by what is left; transient failures are retried only while
 * budget remains. A deadline abort surfaces as CallBudgetExceededError, a
 * caller abort as the SDK's abort error (never retried).
 */
export function budgetedRequest<T>(
  budget: CallBudget,
  requestTimeoutMs: number,
  send: (options: { signal: AbortSignal; timeout: number }) => Promise<T>,
): Promise<T> {
  return withRetry(
    async () => {
      budget.throwIfDone();
      try {
        return await send({
          signal: budget.signal,
          timeout: Math.max(1, Math.min(requestTimeoutMs, budget.remaining())),
        });
      } catch (err) {
        throw budget.translate(err);
      }
    },
    {
      isRetryable: (err) =>
        !budget.signal.aborted && !(err instanceof CallBudgetExceededError) && isTransient(err),
    },
  );
}

/** Token usage of one response; estimated (with a warning) when the provider sent none. */
export function usageOrEstimate(
  reported: { tokensIn: number; tokensOut: number } | null,
  estimateFrom: { messages: ChatMessage[]; system?: string; output: string },
  warn: (message: string) => void,
  what: string,
): { tokensIn: number; tokensOut: number } {
  if (reported) return reported;
  const prompt = [estimateFrom.system ?? '', ...estimateFrom.messages.map((m) => m.content)]
    .filter(Boolean)
    .join('\n');
  const estimate = { tokensIn: estimateTokens(prompt), tokensOut: estimateTokens(estimateFrom.output) };
  warn(`${what} returned no usage; estimated ${estimate.tokensIn} in / ${estimate.tokensOut} out tokens`);
  return estimate;
}

/** Call the warning hook; observational, so its own errors are swallowed. */
export function warnWith(opts: LlmAdapterOptions): (message: string) => void {
  const sink = opts.onWarning ?? ((m: string) => process.emitWarning(m, { code: 'DEVDIGEST_LLM_USAGE' }));
  return (message) => {
    try {
      sink(message);
    } catch {
      // observational only
    }
  };
}

/** The error thrown when every attempt failed schema validation. */
export function schemaFailure(
  provider: string,
  schemaName: string,
  attempts: number,
  lastIssues: string,
  lastRaw: string,
): ExternalServiceError {
  return new ExternalServiceError(
    `${provider} structured output failed schema validation for ${schemaName} after ${attempts} attempt(s). ` +
      `Last issues:\n${truncate(lastIssues, ISSUES_SNIPPET)}\n` +
      `Last raw output (${lastRaw.length} chars): ${truncate(lastRaw, RAW_SNIPPET)}`,
    { raw: lastRaw, issues: lastIssues, attempts },
  );
}
