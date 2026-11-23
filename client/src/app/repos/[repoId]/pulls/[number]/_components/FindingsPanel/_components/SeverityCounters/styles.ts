import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  separator: {
    color: "var(--text-muted)",
    fontSize: 13,
    userSelect: "none",
  } satisfies CSSProperties,
} as const;

/**
 * Counter button style. Active → its SEV background + border; another level
 * active (or count 0) → dimmed. No hover state: the filter must be readable
 * from a screenshot.
 */
export function counterStyle(sev: Severity, active: boolean, dimmed: boolean, disabled: boolean): CSSProperties {
  const meta = SEV[sev];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    border: `1px solid ${active ? meta.c : "transparent"}`,
    background: active ? meta.bg : "transparent",
    color: meta.c,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: disabled ? "default" : "pointer",
    opacity: dimmed ? 0.45 : 1,
    transition: "opacity .12s, background .12s, border-color .12s",
  };
}
