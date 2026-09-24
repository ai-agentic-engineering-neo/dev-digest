/**
 * @devdigest/reviewer-core — the review engine.
 *
 * Pure review logic used by the server (local reviews in the studio). NO
 * database, GitHub, or filesystem access; the only side effect is an LLM call
 * through an INJECTED LLMProvider (so it is mock-testable).
 *
 * Consumers wire it via a tsconfig path alias (`@devdigest/reviewer-core` →
 * `../reviewer-core/src`) and consume the TypeScript source directly (tsx in
 * dev, vitest in tests). The package itself never emits JS — its `build` is a
 * type-check.
 */

// Prompt assembly + prompt-injection hardening.
export {
  assemblePrompt,
  wrapUntrusted,
  renderIntent,
  INTENT_SCOPE_RULE,
  type PromptParts,
  type AssembledPrompt,
} from './prompt.js';

// Citation grounding — the mandatory mechanical gate for diff findings.
export { groundFindings, groundingSummary, type GroundingResult } from './grounding.js';

// Out-of-scope policy (server/specs/05-intent-layer.md) — the mandatory
// mechanical gate that normalizes a finding's out_of_scope flag.
export { applyScopePolicy, type ScopePolicyResult } from './review/scope.js';

// Structured-output helpers (Zod → JSON Schema + parse-with-repair).
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  truncate,
  type JsonSchema,
  type ParseResult,
} from './llm/structured.js';

// Map-reduce helpers (reduce partials, slice a file's diff).
export { reduceReviews, sliceDiff, scoreFromFindings } from './review/reduce.js';
export { splitOversizeDiff, type SplitResult } from './review/split.js';

// The engine entry point: given (diff + resolved agent inputs + LLM) → grounded Review.
export {
  reviewPullRequest,
  DEFAULT_MAP_THRESHOLD_LINES,
  DEFAULT_REVIEW_MAX_RETRIES,
  DEFAULT_MAP_CONCURRENCY,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_REVIEW_TEMPERATURE,
  type ReviewInput,
  type ReviewOutcome,
  type ReviewEvent,
  type ReviewStrategy,
  type ReviewMode,
} from './review/run.js';

// Output: grounded Review → GitHubReviewPayload (body + inline comments + event).
export {
  toReviewPayload,
  gateTriggered,
  countBlockers,
  type ToReviewOptions,
} from './output/to-review.js';

// The single OpenAI-compatible structured provider (OpenRouter), shared by the
// CI runner and the server's openrouter path. Owns session grouping + guards.
export {
  OpenRouterProvider,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_CALL_BUDGET_MS,
  DEFAULT_LIST_MODELS_TIMEOUT_MS,
  type OpenRouterProviderOptions,
} from './llm/openrouter.js';

// Per-call wall-clock budget (SDK retries + reprompts) and model param rules.
export { createCallBudget, CallBudgetExceededError, type CallBudget } from './llm/budget.js';
export { supportsTemperature, temperatureParam } from './llm/model-params.js';

// Per-response usage reporting (StructuredRequest.onUsage) — shared by every
// provider so a throwing hook never breaks a call.
export { emitUsage, addCost, estimateTokens } from './llm/usage.js';
