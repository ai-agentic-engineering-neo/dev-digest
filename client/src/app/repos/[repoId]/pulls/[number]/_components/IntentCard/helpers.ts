import type { IntentSource } from "@devdigest/shared";

/** Display text for a source badge: its label if the server gave one, else its ref. */
export function sourceText(source: IntentSource): string {
  return source.label ?? source.ref;
}

/** A source counts as "resolved" (its text was actually used) when `used` or `truncated`. */
export function isResolved(source: IntentSource): boolean {
  return source.status === "used" || source.status === "truncated";
}
