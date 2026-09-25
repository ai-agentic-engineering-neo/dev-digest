import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@/lib/types";
import type { Line } from "./helpers";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  /** Dot beside a flagged file's path (server/specs/06-smart-diff.md) — distinct from the comment counter. */
  findingDot: (severity: Severity): CSSProperties => ({
    width: 7,
    height: 7,
    borderRadius: 99,
    background: SEV[severity].c,
    flexShrink: 0,
  }),
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent), plus an
 *  optional left stripe when a finding anchors here (server/specs/06-smart-diff.md).
 *  Sets `borderLeftColor` alone, never the `border`/`borderColor` shorthand,
 *  so it never clobbers a sibling border rule (client/INSIGHTS.md). */
export function lineRowFor(kind: Line["kind"], severity?: Severity | null): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return {
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
    background,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: severity ? SEV[severity].c : "transparent",
  };
}

/** Right-aligned severity badge on a finding's line ("blocker" / "warning" /
 *  "suggestion"): outlined pill in the severity colour, tinted over an opaque
 *  surface so the add/del row tint doesn't bleed through. It is a button that
 *  shows/hides the line's finding cards. */
export function findingBadgeFor(severity: Severity, interactive: boolean): CSSProperties {
  const { c, bg } = SEV[severity];
  return {
    marginLeft: "auto",
    marginRight: 10,
    alignSelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 7px",
    fontSize: 11.5,
    fontWeight: 600,
    lineHeight: "17px",
    whiteSpace: "nowrap",
    color: c,
    border: `1px solid ${c}`,
    borderRadius: 5,
    backgroundColor: "var(--bg-surface)",
    backgroundImage: `linear-gradient(${bg}, ${bg})`,
    cursor: interactive ? "pointer" : "default",
    flexShrink: 0,
  };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}
