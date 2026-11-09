/** AC-17 — the feature's own default, NOT shared FEATURE_MODELS. Mirrored in client/src/lib/feature-models.ts (risk_brief). */
export const DEFAULT_BRIEF_MODEL = { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } as const;
export const BRIEF_SCHEMA_NAME = 'PrRiskBrief'; // json_schema name + MockLLMProvider fixture key
export const BRIEF_MAX_TOKENS = 2_000; // D9
export const BRIEF_LLM_TIMEOUT_MS = 60_000; // AC-12, per model call
export const BRIEF_VALIDATION_RETRIES = 1; // AC-3
export const BRIEF_TRANSPORT_RETRIES = 0; // AC-3: no hidden SDK / withRetry calls
export const BRIEF_INPUT_TOKEN_LIMIT = 8_000; // AC-20
export const BRIEF_CHARS_PER_TOKEN = 4; // SPEC-01 estimate: ceil(chars / 4)
export const MAX_BRIEF_RISKS = 6; // AC-15
export const MAX_BRIEF_FOCUS = 7; // AC-15
export const SUMMARY_MAX_CHARS = 1_200;
export const RISK_KIND_MAX_CHARS = 40;
export const RISK_TITLE_MAX_CHARS = 160;
export const RISK_EXPLANATION_MAX_CHARS = 600;
export const MAX_REFS_PER_RISK = 8;
export const FOCUS_REASON_MAX_CHARS = 300;
export const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
