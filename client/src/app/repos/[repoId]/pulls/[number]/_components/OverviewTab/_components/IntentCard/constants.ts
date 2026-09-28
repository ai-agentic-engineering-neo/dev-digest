import type { IntentConfidence, IntentSourceKind } from "@devdigest/shared";

/**
 * Written out rather than read off the `IntentConfidence` zod enum: the
 * client's vendored `@devdigest/shared` is a TYPE-only dependency here (its
 * barrel re-exports with `.js` specifiers Next's bundler cannot resolve
 * against the `.ts` sources), so a value import type-checks, passes vitest,
 * and then fails `next build`. The exhaustiveness guard below is what keeps
 * this list honest instead.
 */
export const INTENT_CONFIDENCE = ["high", "medium", "low"] as const;

/** Compile error the day the contract gains a confidence level this card does not render. */
type MissingConfidence = Exclude<IntentConfidence, (typeof INTENT_CONFIDENCE)[number]>;
const _exhaustive: MissingConfidence extends never ? true : never = true;
void _exhaustive;

export const CONFIDENCE_COLOR: Record<
  (typeof INTENT_CONFIDENCE)[number],
  { color: string; bg: string }
> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** Fixed render order for "Derived from" — a re-derivation reshuffling
 * `sources` should never make the row jump around between reloads. */
export const SOURCE_KIND_ORDER: readonly IntentSourceKind[] = [
  "pr_title",
  "pr_body",
  "linked_doc",
  "linked_issue",
  "branch_name",
  "commit_messages",
  "changed_files",
  "labels",
  "ticket_ref",
  "external_link",
];
