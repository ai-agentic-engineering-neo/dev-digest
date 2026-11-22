import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  severityGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;

/** Severity chip: outlined in its SEV color when inactive, filled when active.
   The active look is static (not hover), so the filter state is always visible. */
export function severityChip(level: Severity, active: boolean): CSSProperties {
  const c = SEV[level].c;
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: 999,
    border: `1px solid ${c}`,
    background: active ? c : "transparent",
    color: active ? "var(--bg-primary)" : c,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    lineHeight: 1.4,
    cursor: "pointer",
  };
}
