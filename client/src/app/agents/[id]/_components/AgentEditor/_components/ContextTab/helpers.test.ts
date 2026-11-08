import { describe, it, expect } from "vitest";
import type { AgentContextDoc, ContextDoc } from "@/lib/types";
import { buildContextRows, moveAttached, toggleAttached, tooLargeAttached } from "./helpers";

const DOCS: ContextDoc[] = [
  { path: "specs/b.md", source: "specs", tokens: 300, attached_agents: 1 },
  { path: "README.md", source: "readme", tokens: 100, attached_agents: 0 },
  { path: "docs/a.md", source: "docs", tokens: 5000, attached_agents: 1 },
];
const ATTACHED: AgentContextDoc[] = [
  { path: "docs/gone.md", position: 1, status: "missing", source: null, tokens: null },
  { path: "docs/a.md", position: 0, status: "ok", source: "docs", tokens: 5000 },
];

describe("buildContextRows", () => {
  it("puts attached docs first in position order (missing included), then the rest by path", () => {
    const rows = buildContextRows(DOCS, ATTACHED);
    expect(rows.map((r) => [r.path, r.attached, r.position, r.status])).toEqual([
      ["docs/a.md", true, 0, "ok"],
      ["docs/gone.md", true, 1, "missing"],
      ["README.md", false, -1, "ok"],
      ["specs/b.md", false, -1, "ok"],
    ]);
    expect(rows[0]!.attachedAgents).toBe(1);
    expect(rows[1]!.tokens).toBeNull();
  });
});

describe("toggleAttached / moveAttached", () => {
  it("appends on attach and removes on detach", () => {
    expect(toggleAttached(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleAttached(["a", "b"], "a")).toEqual(["b"]);
  });

  it("moves within bounds and ignores unknown paths", () => {
    expect(moveAttached(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveAttached(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
    expect(moveAttached(["a", "b"], "x", 0)).toEqual(["a", "b"]);
  });
});

describe("tooLargeAttached (AC-7)", () => {
  it("lists only attached docs over the 4,000-token cap", () => {
    const rows = buildContextRows(DOCS, ATTACHED);
    expect(tooLargeAttached(rows).map((r) => r.path)).toEqual(["docs/a.md"]);
  });
});
