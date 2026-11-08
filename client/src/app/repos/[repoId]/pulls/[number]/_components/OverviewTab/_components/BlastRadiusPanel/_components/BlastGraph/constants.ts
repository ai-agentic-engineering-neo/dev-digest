/** viewBox width of the graph; the SVG scales down to the card width. */
export const GRAPH_WIDTH = 560;
export const GRAPH_ROW_HEIGHT = 36;
export const NODE_HEIGHT = 26;
/** Column centers (x) and node widths: changed symbol → callers → endpoints. */
export const COLUMNS = {
  symbol: { x: 62, width: 112 },
  caller: { x: 262, width: 140 },
  endpoint: { x: 468, width: 172 },
} as const;
/** Caps keep the drawing readable; everything is still listed in the Tree view. */
export const MAX_GRAPH_SYMBOLS = 8;
export const MAX_GRAPH_CALLERS = 16;
export const MAX_GRAPH_ENDPOINTS = 10;
/** Approximate mono glyph width at 11px, for label truncation. */
export const CHAR_WIDTH = 6.7;
/** Legend order and its message key under `graph.legend.*`. */
export const LEGEND = [
  { kind: "symbol", key: "symbol" },
  { kind: "caller", key: "callers" },
  { kind: "endpoint", key: "endpoints" },
] as const;
