import type { CSSProperties } from "react";
import type { TokenKind } from "./helpers";

/* The overlay technique: a transparent <textarea> sits exactly on top of a
   highlighted <pre>. EVERY metric below that affects glyph position must be
   byte-identical between `textarea` and `highlight`, or the caret drifts from
   the text under it. Soft wrapping is OFF (wrap="off") so one logical line is
   always one visual line and the gutter cannot shear. */

const FONT_SIZE = 12.5;
const LINE_HEIGHT = 20;
const PAD = 12;
const FONT_FAMILY = 'var(--font-mono, "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace)';

/** Shared text metrics — spread into both layers, never edited in one only. */
const metrics: CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  letterSpacing: 0,
  tabSize: 2,
  padding: `${PAD}px`,
  margin: 0,
  border: "none",
  whiteSpace: "pre",
  overflowWrap: "normal",
  wordBreak: "normal",
};

export const s = {
  wrap: {
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filename: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  headSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  tokens: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,

  body: (height: number): CSSProperties => ({ display: "flex", height, minHeight: 160 }),

  gutter: {
    ...metrics,
    flexShrink: 0,
    width: 46,
    textAlign: "right",
    paddingRight: 8,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    userSelect: "none",
  } satisfies CSSProperties,

  editArea: { position: "relative", flex: 1, minWidth: 0 } satisfies CSSProperties,

  highlight: {
    ...metrics,
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  textarea: {
    ...metrics,
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    resize: "none",
    outline: "none",
    background: "transparent",
    // Transparent glyphs; the <pre> underneath supplies the colour. The caret
    // and the selection highlight are still painted by the textarea.
    color: "transparent",
    caretColor: "var(--text-primary)",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;

/** Colour per token kind. Four rules is the whole markdown grammar we colour. */
export const TOKEN_STYLE: Record<TokenKind, CSSProperties> = {
  text: {},
  heading: { color: "var(--accent)", fontWeight: 700 },
  bold: { color: "var(--text-primary)", fontWeight: 700 },
  bullet: { color: "var(--info)" },
  fence: { color: "var(--text-muted)" },
  code: { color: "var(--ok)" },
};
