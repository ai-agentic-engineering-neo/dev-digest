import type { CSSProperties } from "react";
import type { LineDiffOpType } from "@/lib/line-diff";

const DIFF_BG: Record<LineDiffOpType, string> = {
  add: "var(--ok-bg)",
  remove: "var(--crit-bg)",
  equal: "transparent",
};
const DIFF_COLOR: Record<LineDiffOpType, string> = {
  add: "var(--ok)",
  remove: "var(--crit)",
  equal: "var(--text-secondary)",
};

export const s = {
  diffBody: {
    maxHeight: "60vh",
    overflow: "auto",
    padding: "10px 20px",
    fontSize: 12.5,
    lineHeight: "20px",
  } satisfies CSSProperties,
  diffLine: (type: LineDiffOpType): CSSProperties => ({
    display: "flex",
    gap: 10,
    background: DIFF_BG[type],
    color: DIFF_COLOR[type],
  }),
  diffMarker: { width: 14, flexShrink: 0, textAlign: "center", opacity: 0.8 } satisfies CSSProperties,
  diffText: { whiteSpace: "pre-wrap", wordBreak: "break-word" } satisfies CSSProperties,
} as const;
