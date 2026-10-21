/* Graph layout: three columns (changed symbols → callers → endpoints/crons) in
   a fixed logical coordinate space; the SVG scales to the card's width. */
import type { BlastRadius } from "@devdigest/shared";
import { GRAPH_MAX_CALLERS, GRAPH_MAX_SYMBOLS, GRAPH_MAX_TARGETS } from "../../constants";

export type NodeKind = "symbol" | "caller" | "endpoint" | "cron" | "more";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  title: string;
  column: 0 | 1 | 2;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const WIDTH = 560;
export const NODE_H = 26;
const PITCH = 38;
const PAD_Y = 10;
const COLUMN_X = [8, 196, 384] as const;
const NODE_W = 168;
const MAX_CHARS = 20;

function clip(label: string): string {
  return label.length > MAX_CHARS ? `${label.slice(0, MAX_CHARS - 1)}…` : label;
}

/** Nodes and edges for the graph, each column capped with a trailing "+N more" node. */
export function layoutGraph(data: BlastRadius, symbolLabel: (name: string) => string, moreLabel: (n: number) => string): GraphLayout {
  const symbols = data.downstream.slice(0, GRAPH_MAX_SYMBOLS);
  const symbolMore = data.downstream.length - symbols.length;

  const callerIds = new Map<string, string>(); // "name@file" → node id
  const callers: { id: string; label: string; title: string }[] = [];
  const targets = new Map<string, { id: string; kind: "endpoint" | "cron" }>();
  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();
  const link = (from: string, to: string) => {
    const k = `${from}>${to}`;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edges.push({ from, to });
  };
  const targetId = (label: string, kind: "endpoint" | "cron") => {
    let t = targets.get(label);
    if (!t) {
      t = { id: `t:${label}`, kind };
      targets.set(label, t);
    }
    return t.id;
  };

  let hiddenCallers = 0;
  for (const entry of symbols) {
    const sid = `s:${entry.symbol}`;
    const reached = new Set<string>();
    for (const c of entry.callers) {
      const key = `${c.name}@${c.file}`;
      let cid = callerIds.get(key);
      if (!cid) {
        if (callers.length >= GRAPH_MAX_CALLERS) {
          hiddenCallers += 1;
          continue;
        }
        cid = `c:${key}`;
        callerIds.set(key, cid);
        callers.push({ id: cid, label: c.name, title: `${c.name} · ${c.file}:${c.line}` });
      }
      link(sid, cid);
      for (const e of c.endpoints ?? []) {
        link(cid, targetId(e, "endpoint"));
        reached.add(e);
      }
      for (const j of c.crons ?? []) {
        link(cid, targetId(j, "cron"));
        reached.add(j);
      }
    }
    // Targets the server could not attribute to a caller file hang off the symbol itself.
    for (const e of entry.endpoints_affected) if (!reached.has(e)) link(sid, targetId(e, "endpoint"));
    for (const j of entry.crons_affected) if (!reached.has(j)) link(sid, targetId(j, "cron"));
  }

  const targetList = [...targets.entries()];
  const shownTargets = targetList.slice(0, GRAPH_MAX_TARGETS);
  const hiddenTargetIds = new Set(targetList.slice(GRAPH_MAX_TARGETS).map(([, t]) => t.id));

  const col0: GraphNode[] = symbols.map((e) => ({
    id: `s:${e.symbol}`,
    kind: "symbol",
    label: clip(symbolLabel(e.symbol)),
    title: symbolLabel(e.symbol),
    column: 0,
    x: COLUMN_X[0],
    y: 0,
  }));
  if (symbolMore > 0) col0.push(moreNode("s:more", 0, moreLabel(symbolMore)));

  const col1: GraphNode[] = callers.map((c) => ({
    id: c.id,
    kind: "caller",
    label: clip(c.label),
    title: c.title,
    column: 1,
    x: COLUMN_X[1],
    y: 0,
  }));
  if (hiddenCallers > 0) col1.push(moreNode("c:more", 1, moreLabel(hiddenCallers)));

  const col2: GraphNode[] = shownTargets.map(([label, t]) => ({
    id: t.id,
    kind: t.kind,
    label: clip(label),
    title: label,
    column: 2,
    x: COLUMN_X[2],
    y: 0,
  }));
  if (hiddenTargetIds.size > 0) col2.push(moreNode("t:more", 2, moreLabel(hiddenTargetIds.size)));

  const rows = Math.max(col0.length, col1.length, col2.length, 1);
  const height = PAD_Y * 2 + rows * PITCH - (PITCH - NODE_H);
  for (const col of [col0, col1, col2]) {
    const top = PAD_Y + ((rows - col.length) * PITCH) / 2;
    col.forEach((n, i) => {
      n.y = top + i * PITCH;
    });
  }

  const visible = new Set([...col0, ...col1, ...col2].map((n) => n.id));
  return {
    width: WIDTH,
    height,
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
    nodes: [...col0, ...col1, ...col2],
    edges: edges.filter((e) => visible.has(e.from) && visible.has(e.to)),
  };
}

function moreNode(id: string, column: 0 | 1 | 2, label: string): GraphNode {
  return { id, kind: "more", label, title: label, column, x: COLUMN_X[column], y: 0 };
}

/** A cubic curve from the right edge of `a` to the left edge of `b`. */
export function edgePath(a: GraphNode, b: GraphNode, nodeWidth: number, nodeHeight: number): string {
  const x1 = a.x + nodeWidth;
  const y1 = a.y + nodeHeight / 2;
  const x2 = b.x;
  const y2 = b.y + nodeHeight / 2;
  const dx = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
