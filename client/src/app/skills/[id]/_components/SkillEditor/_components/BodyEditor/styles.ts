import type { CSSProperties } from "react";
import type { LineKind } from "./helpers";
import { FONT_SIZE, GUTTER_WIDTH, LINE_HEIGHT, MIN_ROWS, PAD_RIGHT, PAD_Y } from "./constants";

const text: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  tabSize: 2,
  letterSpacing: 0,
};

const KIND_COLOR: Record<LineKind, string> = {
  heading: "var(--accent)",
  fence: "var(--text-secondary)",
  text: "var(--text-primary)",
};

export const s = {
  frame: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-primary)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  fileName: { fontWeight: 600, fontSize: 12 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 } satisfies CSSProperties,
  area: {
    position: "relative",
    padding: `${PAD_Y}px 0`,
    minHeight: MIN_ROWS * LINE_HEIGHT + PAD_Y * 2,
  } satisfies CSSProperties,
  row: { display: "flex" } satisfies CSSProperties,
  num: <CSSProperties>{
    ...text,
    width: GUTTER_WIDTH,
    flexShrink: 0,
    textAlign: "right",
    paddingRight: 14,
    color: "var(--text-muted)",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  line: (kind: LineKind): CSSProperties => ({
    ...text,
    flex: 1,
    minWidth: 0,
    paddingRight: PAD_RIGHT,
    color: KIND_COLOR[kind],
    fontWeight: kind === "heading" ? 600 : 400,
  }),
  input: <CSSProperties>{
    ...text,
    position: "absolute",
    top: 0,
    bottom: 0,
    left: GUTTER_WIDTH,
    right: 0,
    width: `calc(100% - ${GUTTER_WIDTH}px)`,
    padding: `${PAD_Y}px ${PAD_RIGHT}px ${PAD_Y}px 0`,
    margin: 0,
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    background: "transparent",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    caretColor: "var(--text-primary)",
  },
} as const;
