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
export function pathToChanged(
  selectedId: string,
  nodes: BlastGraphNode[],
  edges: BlastGraphEdge[],
): PathHighlight {
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
