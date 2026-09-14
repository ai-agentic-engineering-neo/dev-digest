import { RiskKind } from '@devdigest/shared';

/**
 * brief constants (specs/11-why-risk-brief.md, plans/11-why-risk-brief.md).
 *
 * Every numeric budget for this feature lives here, in one place, with the
 * plan's own rationale kept next to each value so a future change has the
 * "why" beside the number.
 */

// --- Input budget (D12/Q3) --------------------------------------------------

/**
 * Absolute token budget for the WHOLE assembled model input — system prompt +
 * INJECTION_GUARD + user payload (`messages.map(m => m.content).join()`), not
 * the facts payload alone. Deliberately different scope than `plans/10`'s
 * `ONBOARDING_FACTS_TOKEN_BUDGET`, which bounds only the facts payload — see
 * plans/11-why-risk-brief.md Q3. D12 permits lowering with a documented
 * reason and forbids raising; never lower this without one.
 */
export const BRIEF_INPUT_TOKEN_BUDGET = 8000;

/** Passed as `maxTokens` on the one `StructuredRequest` — two short
 *  paragraphs, ≤6 risks, ≤5 focus entries. */
export const BRIEF_MAX_OUTPUT_TOKENS = 1500;

// --- Output bounds (AC-14, enforced deterministically per Q5) --------------

export const MAX_RISKS = 6;
export const MAX_FOCUS = 5;
/** Clamp `what`/`why` to their first N sentences (Q5). */
export const MAX_SENTENCES = 2;

/** Clarification 6 (normative) — re-exported here so `grounding.ts`'s AC-15
 *  normalisation has one place to read the closed vocabulary from, without a
 *  second copy of the list. */
export const RISK_KINDS = RiskKind.options;

// --- Checkout reads (finding 5: via resolveContainedPath) ------------------

/** Per-spec-document read ceiling, same value as onboarding's
 *  `MAX_MANIFEST_BYTES` / project-context's `MAX_DOC_BYTES`. */
export const MAX_SPEC_BYTES = 256 * 1024;

/** Linked-issue body is untrusted repository-adjacent text (anyone who can
 *  open an issue); capped before it ever reaches the prompt payload. */
export const MAX_ISSUE_BODY_CHARS = 4000;

// --- Payload drop-loop clamp targets (Approach §4's budget loop, fixed order) --

/** Drop step 1: "blast callers beyond the top 20 (rank-ordered)". Applied by
 *  `prompts.ts`'s drop loop ONLY when the assembled input is over budget —
 *  `facts.ts` itself carries the full (safety-bounded) list so the loop has
 *  something real to trim. */
export const FACT_CALLERS_MAX = 20;

/** Drop step 3: "impacted endpoints beyond 20". */
export const FACT_ENDPOINTS_MAX = 20;

/** Drop step 4: "changed-file rows beyond 40 (largest-churn first kept)". */
export const FACT_FILES_MAX = 40;

/**
 * Raw safety ceilings on the fact-pool sizes `facts.ts` ever carries
 * (pre-drop-loop) — distinct from the `FACT_*_MAX` clamp TARGETS above.
 * `changed_symbols` is never part of the fixed drop order (small by
 * construction: one entry per declared symbol in the PR's own changed
 * files), so it gets only this defensive ceiling, never a budget-driven trim.
 */
export const FACT_SYMBOLS_MAX = 200;
export const FACT_POOL_SAFETY_MAX = 500;
