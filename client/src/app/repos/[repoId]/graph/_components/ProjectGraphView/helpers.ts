import type { ProjectGraphNode, ProjectGraphReady } from "@devdigest/shared";
import type { GraphEdgeInput, GraphNodeInput } from "@/components/graph-canvas";

export const parentDir = (path: string): string | null => {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : null;
};

/** Cumulative breadcrumb segments: "a/b/c" → [{label:"a",path:"a"},{label:"b",path:"a/b"},…]. */
export function crumbsOf(path: string | null): { label: string; path: string }[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((label, i) => ({ label, path: parts.slice(0, i + 1).join("/") }));
}

interface ToCanvasOpts {
  tags: { hot: string; cycle: string; files: (n: number) => string; aggregate: string; exported: string };
  /** Member paths of the cycle the user asked to highlight, if any. */
  highlight: ReadonlySet<string> | null;
}

/** Role is a shape + icon + label, so "hot" and "cycle" never rely on colour alone. */
function roleOf(n: ProjectGraphNode): string {
  // A directory is always a directory: its "hot"/"cycle" status is a tag, or a
  // screen reader would announce "hot file: components" for a folder.
  if (n.kind === "directory") return "directory";
  if (n.hot) return "hot";
  if (n.inCycle) return "cycle";
  if (n.kind === "file") return "file";
  return "other";
}

export function toCanvas(graph: ProjectGraphReady, opts: ToCanvasOpts) {
  const { tags, highlight } = opts;
  const inHighlight = (n: ProjectGraphNode) => !!highlight?.has(n.path) || !!highlight?.has(n.id);
  const nodes: GraphNodeInput[] = graph.nodes.map((n) => {
    const t: string[] = [];
    if (n.hot) t.push(tags.hot);
    if (n.inCycle) t.push(tags.cycle);
    if (n.kind === "directory") t.push(tags.files(n.fileCount));
    if (n.aggregate) t.push(tags.aggregate);
    if (n.kind === "symbol" && n.exported) t.push(tags.exported);
    return {
      id: n.id,
      label: n.label,
      role: roleOf(n),
      secondary: n.path !== n.label ? n.path : undefined,
      tags: t,
      highlighted: highlight ? inHighlight(n) : undefined,
      dimmed: highlight ? !inHighlight(n) : undefined,
    };
  });
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges: GraphEdgeInput[] = graph.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    inferred: e.confidence === "inferred",
    typeOnly: e.kind === "type",
    // AC-47: the canvas labels and thickens edges by weight (`×N`);
    // `highlighted` is reserved for cycle edges.
    weight: e.weight,
    highlighted: !!byId.get(e.from)?.inCycle && !!byId.get(e.to)?.inCycle,
    dimmed: highlight ? !(highlight.has(e.from) && highlight.has(e.to)) : undefined,
  }));
  return { nodes, edges };
}

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
