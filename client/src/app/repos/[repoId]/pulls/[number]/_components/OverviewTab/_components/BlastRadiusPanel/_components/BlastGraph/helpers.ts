import type { BlastDownstream } from "@/lib/types";
import {
  CHAR_WIDTH,
  COLUMNS,
  MAX_GRAPH_CALLERS,
  MAX_GRAPH_ENDPOINTS,
  MAX_GRAPH_SYMBOLS,
} from "./constants";

export type GraphNodeKind = keyof typeof COLUMNS;

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Full text for the tooltip (`file:line` for callers). */
  title: string;
  x: number;
  y: number;
  width: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** symbol → endpoint edges are indirect: the endpoint lives in a caller's file. */
  indirect: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height: number;
  /** Nodes left out by the MAX_GRAPH_* caps. */
  hidden: number;
}

/** Cuts a label to fit a node of `width` px (mono 11px). */
export function fitLabel(label: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 14) / CHAR_WIDTH));
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

function place(ids: string[], height: number, rowHeight: number): Map<string, number> {
  const top = (height - ids.length * rowHeight) / 2 + rowHeight / 2;
  return new Map(ids.map((id, i) => [id, top + i * rowHeight]));
}

/**
 * Pure three-column layout: changed symbols → their callers → endpoints affected.
 * Callers and endpoints shared by several symbols become one node (deduped by identity);
 * order is first appearance in `downstream`, so the drawing is deterministic.
 */
export function layoutBlastGraph(
  downstream: BlastDownstream[],
  opts: { rowHeight: number },
): GraphLayout {
  const symbols = new Map<string, { label: string; title: string }>();
  const callers = new Map<string, { label: string; title: string }>();
  const endpoints = new Map<string, { label: string; title: string }>();
  const edges = new Map<string, GraphEdge>();
  const allCallers = new Set<string>();
  const allEndpoints = new Set<string>();

  downstream.forEach((d, i) => {
    for (const c of d.callers) allCallers.add(`${c.file}:${c.line}:${c.name}`);
    for (const e of d.endpoints_affected) allEndpoints.add(e);
    if (i >= MAX_GRAPH_SYMBOLS) return;

    const symbolId = `s:${d.file}::${d.symbol}`;
    symbols.set(symbolId, { label: `${d.symbol}()`, title: `${d.file} · ${d.symbol}` });
    for (const c of d.callers) {
      const callerId = `c:${c.file}:${c.line}:${c.name}`;
      if (!callers.has(callerId)) {
        if (callers.size >= MAX_GRAPH_CALLERS) continue;
        callers.set(callerId, { label: c.name, title: `${c.file}:${c.line}` });
      }
      edges.set(`${symbolId}>${callerId}`, { id: `${symbolId}>${callerId}`, from: symbolId, to: callerId, indirect: false });
    }
    for (const e of d.endpoints_affected) {
      const endpointId = `e:${e}`;
      if (!endpoints.has(endpointId)) {
        if (endpoints.size >= MAX_GRAPH_ENDPOINTS) continue;
        endpoints.set(endpointId, { label: e, title: e });
      }
      edges.set(`${symbolId}>${endpointId}`, { id: `${symbolId}>${endpointId}`, from: symbolId, to: endpointId, indirect: true });
    }
  });
  const hidden =
    Math.max(0, downstream.length - symbols.size) +
    (allCallers.size - callers.size) +
    (allEndpoints.size - endpoints.size);

  const rows = Math.max(symbols.size, callers.size, endpoints.size, 1);
  const height = rows * opts.rowHeight + 8;
  const column = (kind: GraphNodeKind, entries: Map<string, { label: string; title: string }>): GraphNode[] => {
    const ys = place([...entries.keys()], height, opts.rowHeight);
    const { x, width } = COLUMNS[kind];
    return [...entries].map(([id, n]) => ({ id, kind, label: fitLabel(n.label, width), title: n.title, x, y: ys.get(id)!, width }));
  };

  return {
    nodes: [...column("symbol", symbols), ...column("caller", callers), ...column("endpoint", endpoints)],
    edges: [...edges.values()],
    height,
    hidden,
  };
}

/** Horizontal cubic Bézier from the right edge of `a` to the left edge of `b`. */
export function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.width / 2;
  const x2 = b.x - b.width / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`;
}
