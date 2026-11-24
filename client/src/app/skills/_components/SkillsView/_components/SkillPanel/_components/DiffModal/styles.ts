import type { CSSProperties } from "react";

export const s = {
  body: { padding: "12px 0", maxHeight: "60vh", overflow: "auto" } satisfies CSSProperties,
  row: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
  }),
  no: {
    width: 44,
    flexShrink: 0,
    textAlign: "right",
    paddingRight: 8,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  sign: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    width: 16,
    flexShrink: 0,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
  }),
  text: { flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word", paddingRight: 12 } satisfies CSSProperties,
  message: { padding: "24px 20px", color: "var(--text-muted)", fontSize: 13.5 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
