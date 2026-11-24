import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

/** Visual state of one severity counter. */
export type PillState = "neutral" | "active" | "muted";

/** Co-located styles for SeverityFilter. Colours come only from `SEV`. */
export const s = {
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  separator: {
    color: "var(--text-muted)",
    fontSize: 13,
    userSelect: "none",
  } satisfies CSSProperties,
  label: { textTransform: "uppercase", letterSpacing: "0.04em" } satisfies CSSProperties,
} as const;

/**
 * Pill style per state. Deliberately hover-independent: the active level stays
 * highlighted for as long as the filter is on, so its state reads from a screenshot.
 */
export function pillStyle(sev: Severity, state: PillState): CSSProperties {
  const tone = SEV[sev];
  const active = state === "active";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity .12s, background .12s, border-color .12s",
    border: `1px solid ${active ? tone.c : "var(--border)"}`,
    background: active ? tone.bg : "transparent",
    color: active ? tone.c : "var(--text-secondary)",
    opacity: state === "muted" ? 0.5 : 1,
  };
}
