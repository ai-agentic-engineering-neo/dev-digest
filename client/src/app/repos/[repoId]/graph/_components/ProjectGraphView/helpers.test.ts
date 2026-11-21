import { describe, expect, it } from "vitest";
import type { ProjectGraphNode, ProjectGraphReady } from "@devdigest/shared";
import { toCanvas } from "./helpers";

const node = (over: Partial<ProjectGraphNode>): ProjectGraphNode => ({
  id: "x",
  kind: "file",
  label: "x",
  path: "x",
  fileCount: 1,
  aggregate: false,
  rank: 0,
  hot: false,
  inCycle: false,
  ...over,
});

const tags = { hot: "hot", cycle: "cycle", files: (n: number) => `${n} files`, aggregate: "neighbour", exported: "exported" };

// Regression (browser smoke): hot directories were announced as "hot file: components".
describe("project graph → canvas roles", () => {
  it("keeps a hot or cyclic directory in the directory role and tags it instead", () => {
    const graph = {
      nodes: [
        node({ id: "src/components", kind: "directory", label: "components", path: "src/components", fileCount: 12, hot: true, inCycle: true }),
        node({ id: "src/a.ts", label: "a.ts", path: "src/a.ts", hot: true }),
      ],
      edges: [],
    } as unknown as ProjectGraphReady;
    const { nodes } = toCanvas(graph, { tags, highlight: null });
    expect(nodes[0]).toMatchObject({ role: "directory", tags: ["hot", "cycle", "12 files"] });
    expect(nodes[1]).toMatchObject({ role: "hot", tags: ["hot"] });
  });
});
