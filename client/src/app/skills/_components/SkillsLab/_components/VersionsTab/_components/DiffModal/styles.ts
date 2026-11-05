import type { CSSProperties } from "react";
import type { DiffLine } from "../../../../helpers";

export const s = {
  pre: {
    margin: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--code-bg)",
    fontSize: 13,
    lineHeight: "20px",
    maxHeight: 520,
    overflow: "auto",
    padding: "8px 0",
  } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({
    display: "block",
    padding: "0 14px",
    whiteSpace: "pre",
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-secondary)",
  }),
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
