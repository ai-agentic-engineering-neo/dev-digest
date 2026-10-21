import type { CSSProperties } from "react";
import type { PatchLineKind } from "./helpers";

/** Co-located styles for PatchView. */
export const s = {
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
    background: "var(--code-bg)",
    padding: "6px 0",
  } satisfies CSSProperties,
  line: (kind: PatchLineKind): CSSProperties => ({
    display: "block",
    padding: "0 10px",
    whiteSpace: "pre-wrap",
    fontSize: 12,
    lineHeight: 1.6,
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : kind === "ctx" ? "var(--text-primary)" : "var(--text-muted)",
    background: kind === "add" ? "var(--sugg-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
} as const;
