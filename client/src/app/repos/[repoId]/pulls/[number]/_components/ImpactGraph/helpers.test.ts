import { describe, it, expect } from "vitest";
import type { BlastGraphEdge, BlastGraphNode } from "@devdigest/shared";
import { pathToChanged, toCanvasEdges, toCanvasNodes, visibleEdges, visibleNodes, nodeLine } from "./helpers";

const n = (id: string, role: BlastGraphNode["role"], extra: Partial<BlastGraphNode> = {}): BlastGraphNode => ({
  id,
  kind: "symbol",
  name: id,
  path: `src/${id}.ts`,
  role,
  depth: 0,
  ...extra,
});
const e = (from: string, to: string, extra: Partial<BlastGraphEdge> = {}): BlastGraphEdge => ({
  from,
  to,
  kind: "call",
  confidence: "exact",
  typeOnly: false,
  ...extra,
});

// route → svc → core(changed);  other → svc;  lonely → dead (no changed reachable)
const nodes = [
  n("core", "changed"),
  n("svc", "impacted", { depth: 1 }),
  n("route", "entry_point", { depth: 2, entryLabel: "GET /x" }),
  n("other", "impacted", { depth: 2 }),
  n("lonely", "impacted", { depth: 1, typeOnly: true }),
  n("dead", "impacted", { depth: 1 }),
];
const edges = [
  e("svc", "core", { line: 7 }),
  e("route", "svc", { confidence: "inferred" }),
  e("other", "svc"),
  e("lonely", "dead", { typeOnly: true }),
];

describe("impact graph helpers", () => {
  it("highlights only the paths from the selection to changed nodes", () => {
    const h = pathToChanged("route", nodes, edges);
    expect([...h.nodeIds].sort()).toEqual(["core", "route", "svc"]);
    expect([...h.edgeIdx].sort()).toEqual([0, 1]);

    // selection with no route to a changed node → only itself
    const lone = pathToChanged("lonely", nodes, edges);
    expect([...lone.nodeIds]).toEqual(["lonely"]);
    expect(lone.edgeIdx.size).toBe(0);
  });

  it("maps edges (dashed / thin / dimmed) and nodes (role, tag, secondary) for the canvas", () => {
    const h = pathToChanged("route", nodes, edges);
    const ce = toCanvasEdges(edges, h);
    expect(ce[1]).toMatchObject({ source: "route", target: "svc", inferred: true, highlighted: true });
    expect(ce[3]).toMatchObject({ typeOnly: true, dimmed: true });

    const cn = toCanvasNodes(nodes, "route", h, "type");
    expect(cn.find((x) => x.id === "route")).toMatchObject({ role: "entry", secondary: "GET /x", selected: true });
    expect(cn.find((x) => x.id === "lonely")).toMatchObject({ tags: ["type"], dimmed: true });
  });

  it("hide-inferred drops inferred edges and the nodes only they connected", () => {
    const ve = visibleEdges(edges, true);
    expect(ve).toHaveLength(3);
    expect(visibleNodes(nodes, ve).map((x) => x.id)).not.toContain("route");
    expect(visibleEdges(edges, false)).toHaveLength(4);
  });

  it("uses the node's outgoing edge line for the file:line link", () => {
    expect(nodeLine(nodes[1]!, edges)).toBe(7);
    expect(nodeLine(nodes[0]!, edges)).toBeUndefined();
  });

  it("labels the <module> pseudo-symbol as module scope, never the raw id", () => {
    const [m] = toCanvasNodes([{ ...nodes[0]!, name: "<module>" }], null, null, "type", "(module scope)");
    expect(m!.label).toBe("(module scope)");
  });

  it("prefers the server's declaration line at head over the use-site line (AC-42)", () => {
    expect(nodeLine({ ...nodes[1]!, line: 42 }, edges)).toBe(42);
    expect(nodeLine({ ...nodes[0]!, line: 3 }, edges)).toBe(3);
  });
});
