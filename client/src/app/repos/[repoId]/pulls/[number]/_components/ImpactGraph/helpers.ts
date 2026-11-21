/* Pure mapping/filter helpers for ImpactGraph. React Flow renders no edges in
   jsdom, so edge mapping and path highlighting are asserted through these. */
import type { BlastGraphEdge, BlastGraphNode, BlastNodeRole } from "@devdigest/shared";
import { symbolDisplayName, type GraphEdgeInput, type GraphNodeInput } from "@/components/graph-canvas";

const CANVAS_ROLE: Record<BlastNodeRole, string> = {
  changed: "changed",
  impacted: "impacted",
  entry_point: "entry",
  test: "test",
};

export const edgeId = (e: BlastGraphEdge, i: number) => `${e.from}->${e.to}:${e.kind}:${i}`;

/** Edges after the client-side "hide inferred" filter. */
export function visibleEdges(edges: BlastGraphEdge[], hideInferred: boolean): BlastGraphEdge[] {
  return hideInferred ? edges.filter((e) => e.confidence !== "inferred") : edges;
}

/** Drop nodes left unreachable by the filters: only nodes with a surviving edge or changed roots stay. */
export function visibleNodes(nodes: BlastGraphNode[], edges: BlastGraphEdge[]): BlastGraphNode[] {
  const touched = new Set<string>();
  for (const e of edges) {
    touched.add(e.from);
    touched.add(e.to);
  }
  return nodes.filter((n) => n.role === "changed" || touched.has(n.id));
}

export interface PathHighlight {
  nodeIds: Set<string>;
  /** Indices into the edge array passed in. */
  edgeIdx: Set<number>;
}

/**
 * Edges point dependent (`from`) → depended-upon (`to`, towards changed code).
 * From `selectedId` walk `from → to`, keep only walks that end at a changed
 * node — those are the "paths connecting it to changed nodes".
 */
export function pathToChanged(selectedId: string, nodes: BlastGraphNode[], edges: BlastGraphEdge[]): PathHighlight {
  const changed = new Set(nodes.filter((n) => n.role === "changed").map((n) => n.id));
  const out = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const l = out.get(e.from);
    if (l) l.push(i);
    else out.set(e.from, [i]);
  });

  // Forward reachability from the selection.
  const reach = new Set<string>([selectedId]);
  const queue = [selectedId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const i of out.get(cur) ?? []) {
      const to = edges[i]!.to;
      if (!reach.has(to)) {
        reach.add(to);
        queue.push(to);
      }
    }
  }

  // Keep only nodes inside `reach` that can still get to a changed node.
  const good = new Set<string>([...reach].filter((id) => changed.has(id)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of edges) {
      if (reach.has(e.from) && good.has(e.to) && !good.has(e.from)) {
        good.add(e.from);
        grew = true;
      }
    }
  }
  if (!good.has(selectedId)) return { nodeIds: new Set([selectedId]), edgeIdx: new Set() };

  const edgeIdx = new Set<number>();
  edges.forEach((e, i) => {
    if (reach.has(e.from) && good.has(e.from) && good.has(e.to)) edgeIdx.add(i);
  });
  return { nodeIds: good, edgeIdx };
}

export function toCanvasNodes(
  nodes: BlastGraphNode[],
  selectedId: string | null,
  highlight: PathHighlight | null,
  typeTag: string,
  moduleScope = "(module scope)",
): GraphNodeInput[] {
  return nodes.map((n) => ({
    id: n.id,
    label: symbolDisplayName(n.name, moduleScope),
    role: CANVAS_ROLE[n.role],
    secondary: n.entryLabel ?? n.path,
    deleted: n.deleted || undefined,
    tags: n.typeOnly ? [typeTag] : undefined,
    selected: n.id === selectedId || undefined,
    highlighted: highlight ? highlight.nodeIds.has(n.id) : undefined,
    dimmed: highlight ? !highlight.nodeIds.has(n.id) : undefined,
  }));
}

export function toCanvasEdges(edges: BlastGraphEdge[], highlight: PathHighlight | null): GraphEdgeInput[] {
  return edges.map((e, i) => ({
    id: edgeId(e, i),
    source: e.from,
    target: e.to,
    inferred: e.confidence === "inferred" || undefined,
    typeOnly: e.typeOnly || undefined,
    highlighted: highlight ? highlight.edgeIdx.has(i) : undefined,
    dimmed: highlight ? !highlight.edgeIdx.has(i) : undefined,
  }));
}

/**
 * Line for the GitHub `file:line` link (AC-42): the node's declaration line at
 * head when the server sent one, else its own outgoing edge (use-site) line.
 */
export function nodeLine(node: BlastGraphNode, edges: BlastGraphEdge[]): number | undefined {
  if (node.line != null) return node.line;
  const e = edges.find((x) => x.from === node.id && x.line != null);
  return e?.line ?? undefined;
}

/** One neighbour of a node, with the strongest edge that links them. */
export interface Neighbour {
  node: BlastGraphNode;
  /** Distinct edge kinds between the pair, e.g. `call`, `type`. */
  kinds: BlastGraphEdge["kind"][];
  /** Use-site line of the linking edge (on the dependent side), when known. */
  line: number | null;
  inferred: boolean;
  typeOnly: boolean;
}

export interface NodeNeighbours {
  /** Nodes that depend on this one (edges `from → this`). */
  dependents: Neighbour[];
  /** Nodes this one depends on (edges `this → to`, towards changed code). */
  dependencies: Neighbour[];
}

function collect(pairs: { other: string; edge: BlastGraphEdge }[], byId: Map<string, BlastGraphNode>): Neighbour[] {
  const acc = new Map<string, Neighbour>();
  for (const { other, edge } of pairs) {
    const node = byId.get(other);
    if (!node) continue;
    const cur = acc.get(other);
    if (!cur) {
      acc.set(other, {
        node,
        kinds: [edge.kind],
        line: edge.line ?? null,
        inferred: edge.confidence === "inferred",
        typeOnly: edge.typeOnly,
      });
      continue;
    }
    if (!cur.kinds.includes(edge.kind)) cur.kinds.push(edge.kind);
    // Any exact / runtime edge makes the link exact / runtime.
    cur.inferred = cur.inferred && edge.confidence === "inferred";
    cur.typeOnly = cur.typeOnly && edge.typeOnly;
    if (cur.line == null && edge.line != null) cur.line = edge.line;
  }
  // Changed code first, then by depth, then name — stable, scannable order.
  const roleOrder: Record<string, number> = { changed: 0, impacted: 1, entry_point: 2, test: 3 };
  return [...acc.values()].sort(
    (a, b) =>
      (roleOrder[a.node.role] ?? 9) - (roleOrder[b.node.role] ?? 9) ||
      a.node.depth - b.node.depth ||
      a.node.name.localeCompare(b.node.name),
  );
}

/** Incoming (dependents) and outgoing (dependencies) neighbours of `id`. */
export function neighbours(id: string, nodes: BlastGraphNode[], edges: BlastGraphEdge[]): NodeNeighbours {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    dependents: collect(
      edges.filter((e) => e.to === id && e.from !== id).map((e) => ({ other: e.from, edge: e })),
      byId,
    ),
    dependencies: collect(
      edges.filter((e) => e.from === id && e.to !== id).map((e) => ({ other: e.to, edge: e })),
      byId,
    ),
  };
}

/**
 * Shortest chain `selected → … → changed` along `from → to` edges (BFS), as
 * ordered nodes. `[selected]` for a changed node; `[]` when no changed node is
 * reachable (e.g. the path was cut by a filter).
 */
export function shortestPathToChanged(id: string, nodes: BlastGraphNode[], edges: BlastGraphEdge[]): BlastGraphNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = byId.get(id);
  if (!start) return [];
  if (start.role === "changed") return [start];
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const l = out.get(e.from);
    if (l) l.push(e.to);
    else out.set(e.from, [e.to]);
  }
  const prev = new Map<string, string>();
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of out.get(cur) ?? []) {
      if (seen.has(next) || !byId.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (byId.get(next)!.role === "changed") {
        const chain = [next];
        let p = cur;
        while (p !== id) {
          chain.push(p);
          p = prev.get(p)!;
        }
        chain.push(id);
        return chain.reverse().map((x) => byId.get(x)!);
      }
      queue.push(next);
    }
  }
  return [];
}
