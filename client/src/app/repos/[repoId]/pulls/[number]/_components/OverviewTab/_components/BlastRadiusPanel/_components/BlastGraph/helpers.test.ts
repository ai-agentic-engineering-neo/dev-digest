import { describe, it, expect } from "vitest";
import type { BlastDownstream } from "@/lib/types";
import { COLUMNS, MAX_GRAPH_CALLERS } from "./constants";
import { edgePath, fitLabel, layoutBlastGraph } from "./helpers";

const D: BlastDownstream[] = [
  {
    symbol: "rateLimit",
    file: "src/mw/ratelimit.ts",
    kind: "function",
    callers: [
      { name: "publicRouter", file: "src/api/index.ts", line: 23 },
      { name: "app", file: "src/server.ts", line: 88 },
    ],
    endpoints_affected: ["GET /items", "POST /webhooks"],
    crons_affected: ["reset (hourly)"],
  },
  {
    symbol: "bucketKey",
    file: "src/mw/ratelimit.ts",
    kind: "function",
    // shares the "app" caller and "GET /items" endpoint with rateLimit
    callers: [{ name: "app", file: "src/server.ts", line: 88 }],
    endpoints_affected: ["GET /items"],
    crons_affected: [],
  },
];

describe("layoutBlastGraph", () => {
  it("builds three deduped columns and symbol→caller / symbol→endpoint edges", () => {
    const { nodes, edges, hidden } = layoutBlastGraph(D, { rowHeight: 36 });
    const byKind = (k: string) => nodes.filter((n) => n.kind === k).map((n) => n.label);
    expect(byKind("symbol")).toEqual(["rateLimit()", "bucketKey()"]);
    expect(byKind("caller")).toEqual(["publicRouter", "app"]); // "app" once
    expect(byKind("endpoint")).toEqual(["GET /items", "POST /webhooks"]); // "GET /items" once
    expect(edges.filter((e) => !e.indirect)).toHaveLength(3);
    expect(edges.filter((e) => e.indirect)).toHaveLength(3);
    expect(hidden).toBe(0);
    for (const n of nodes) expect(n.x).toBe(COLUMNS[n.kind].x);
    expect(nodes.find((n) => n.label === "app")!.title).toBe("src/server.ts:88");
  });

  it("is deterministic and keeps every node inside the drawing", () => {
    const a = layoutBlastGraph(D, { rowHeight: 36 });
    expect(layoutBlastGraph(D, { rowHeight: 36 })).toEqual(a);
    for (const n of a.nodes) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(a.height);
    }
  });

  it("caps callers and reports how many nodes are hidden", () => {
    const many: BlastDownstream[] = [
      {
        ...D[0]!,
        callers: Array.from({ length: MAX_GRAPH_CALLERS + 3 }, (_, i) => ({ name: `c${i}`, file: `f${i}.ts`, line: i + 1 })),
      },
    ];
    const { nodes, edges, hidden } = layoutBlastGraph(many, { rowHeight: 36 });
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(MAX_GRAPH_CALLERS);
    expect(edges.filter((e) => !e.indirect)).toHaveLength(MAX_GRAPH_CALLERS);
    expect(hidden).toBe(3);
  });
});

describe("fitLabel / edgePath", () => {
  it("truncates long labels with an ellipsis and keeps short ones", () => {
    expect(fitLabel("app", 140)).toBe("app");
    const cut = fitLabel("aVeryLongCallerNameThatDoesNotFit", 112);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThan("aVeryLongCallerNameThatDoesNotFit".length);
  });

  it("draws from the right edge of the source to the left edge of the target", () => {
    const { nodes } = layoutBlastGraph(D, { rowHeight: 36 });
    const sym = nodes[0]!;
    const caller = nodes.find((n) => n.kind === "caller")!;
    expect(edgePath(sym, caller)).toMatch(new RegExp(`^M${sym.x + sym.width / 2},`));
    expect(edgePath(sym, caller)).toContain(` ${caller.x - caller.width / 2},${caller.y}`);
  });
});
