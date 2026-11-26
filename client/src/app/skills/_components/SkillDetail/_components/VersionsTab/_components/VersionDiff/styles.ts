import type { CSSProperties } from "react";
import type { DiffKind } from "../../helpers";

const LINE_TONE: Record<DiffKind, CSSProperties> = {
  add: { color: "var(--ok)", background: "var(--ok-bg)" },
  del: { color: "var(--crit)", background: "var(--crit-bg)" },
  same: { color: "var(--text-muted)", background: "transparent" },
};

/** Co-located styles for VersionDiff. */
export const s = {
  // Long bodies scroll inside the card instead of stretching the whole list.
  wrap: {
    marginTop: 12,
    maxHeight: 280,
    overflow: "auto",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "10px 0",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  line: (kind: DiffKind): CSSProperties => ({ padding: "0 14px", ...LINE_TONE[kind] }),
  prefix: { display: "inline-block", width: 16, userSelect: "none" } satisfies CSSProperties,
  noChanges: { margin: 0, padding: "16px 14px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
