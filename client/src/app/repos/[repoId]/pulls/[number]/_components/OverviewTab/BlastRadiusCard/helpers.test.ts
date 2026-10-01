import { describe, expect, it } from "vitest";
import { blastStats, degradedReasonKey, hasImpact, symbolRows, unattributedEndpoints } from "./helpers";

const data = {
  changed_symbols: [
    { name: "a", file: "src/a.ts", kind: "function" },
    { name: "b", file: "src/b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "a",
      callers: [
        { name: "x", file: "src/x.ts", line: 1 },
        { name: "y", file: "src/y.ts", line: 2 },
      ],
      endpoints_affected: ["GET /a"],
      crons_affected: ["nightly"],
    },
    {
      symbol: "c",
      callers: [{ name: "x", file: "src/x.ts", line: 9 }],
      endpoints_affected: [],
      crons_affected: ["nightly", "hourly"],
    },
  ],
  impacted_endpoints: ["GET /a", "POST /c"],
};

describe("blast helpers", () => {
  it("counts unique callers/crons and keeps symbols without downstream", () => {
    expect(blastStats(data)).toEqual({ symbols: 3, callers: 2, endpoints: 2, crons: 2 });
    expect(symbolRows(data).map((r) => [r.name, r.callers.length])).toEqual([
      ["a", 2],
      ["b", 0],
      ["c", 1],
    ]);
  });

  it("counts same-named changed symbols once, matching the rendered rows", () => {
    const dup = {
      changed_symbols: [
        { name: "init", file: "src/a.ts", kind: "function" },
        { name: "init", file: "src/b.ts", kind: "function" },
      ],
      downstream: [],
      impacted_endpoints: [],
    };
    expect(blastStats(dup).symbols).toBe(1);
    expect(symbolRows(dup)).toHaveLength(1);
  });

  it("lists only symbols with an impact, while the stat still counts all", () => {
    const rows = symbolRows(data);
    expect(rows.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(rows.filter(hasImpact).map((r) => r.name)).toEqual(["a", "c"]);
    expect(blastStats(data).symbols).toBe(3);
  });

  it("returns flat endpoints that no group claims", () => {
    const d = { ...data, impacted_endpoints: ["GET /a", "GET /x"] };
    expect(unattributedEndpoints(d)).toEqual(["GET /x"]);
  });

  it("maps wire reasons to i18n keys", () => {
    expect(degradedReasonKey("index_failed")).toBe("indexFailed");
    expect(degradedReasonKey("repo_too_large")).toBe("repoTooLarge");
    expect(degradedReasonKey(null)).toBeNull();
  });
});
