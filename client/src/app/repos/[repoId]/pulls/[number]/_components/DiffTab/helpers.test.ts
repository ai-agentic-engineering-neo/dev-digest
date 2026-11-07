import { describe, expect, it } from "vitest";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import type { PrFile, SmartDiff } from "@/lib/types";
import {
  buildGroupViews,
  countFilesWithFindings,
  defaultFileOpen,
  diffFindings,
  latestReviewsPerAgent,
  reviewTokens,
} from "./helpers";

function finding(id: string, file: string, dismissed = false): FindingRecord {
  return { id, file, dismissed_at: dismissed ? "2026-01-01" : null } as FindingRecord;
}

function review(
  id: string,
  agent: string | null,
  created: string,
  findings: FindingRecord[] = [],
  extra: Partial<ReviewRecord> = {},
): ReviewRecord {
  return { id, agent_id: agent, kind: "review", created_at: created, run_id: null, findings, ...extra } as ReviewRecord;
}

function run(id: string, tin: number | null, tout: number | null): RunSummary {
  return { run_id: id, tokens_in: tin, tokens_out: tout } as RunSummary;
}

describe("latest review per agent", () => {
  const reviews = [
    review("a-old", "A", "2026-01-01", [finding("1", "x.ts"), finding("2", "x.ts"), finding("3", "x.ts"), finding("4", "x.ts"), finding("5", "x.ts")]),
    review("a-new", "A", "2026-01-02", [finding("6", "x.ts"), finding("7", "x.ts"), finding("8", "y.ts")]),
    review("b", "B", "2026-01-01", [finding("9", "x.ts"), finding("10", "outside.ts")]),
    review("sum", "A", "2026-01-05", [finding("11", "x.ts")], { kind: "summary" }),
    review("n-old", null, "2026-01-01", [finding("12", "x.ts")]),
    review("n-new", null, "2026-01-03", [finding("13", "x.ts")]),
  ];

  it("keeps only the newest review of each agent and findings in PR files", () => {
    expect(latestReviewsPerAgent(reviews).map((r) => r.id).sort()).toEqual(["a-new", "b", "n-new"]);
    const ids = diffFindings(reviews, new Set(["x.ts", "y.ts"])).map((f) => f.id).sort();
    expect(ids).toEqual(["13", "6", "7", "8", "9"]);
  });

  it("counts files with active findings, not findings", () => {
    const three = [finding("1", "a.ts"), finding("2", "a.ts"), finding("3", "a.ts")];
    expect(countFilesWithFindings(["a.ts", "b.ts"], three)).toBe(1);
    expect(countFilesWithFindings(["a.ts"], [finding("4", "a.ts", true)])).toBe(0);
  });
});

describe("reviewTokens", () => {
  it("sums the runs behind the latest review of each agent", () => {
    const latest = [
      review("a-new", "A", "2", [], { run_id: "r2" }),
      review("b", "B", "1", [], { run_id: "r3" }),
      review("n", null, "1", [], { run_id: null }),
      review("c", "C", "1", [], { run_id: "r4" }),
    ];
    const runs = [run("r1", 5000, 5000), run("r2", 1000, 200), run("r3", 700, 100), run("r4", null, null)];
    expect(reviewTokens(latest, runs)).toBe(2000);
  });
});

describe("buildGroupViews", () => {
  const f = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: `p-${path}` });
  const sf = (path: string) => ({ path, additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] });
  const smart = {
    groups: [
      { role: "core", files: [sf("b.ts"), sf("a.ts"), sf("gone.ts")] },
      { role: "tests", files: [sf("a.test.ts")] },
      { role: "boilerplate", files: [] },
    ],
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  } as unknown as SmartDiff;

  it("returns five ordered groups following GitHub order, handling missing and extra paths", () => {
    const views = buildGroupViews(smart, [f("a.ts"), f("a.test.ts"), f("b.ts"), f("extra.ts")]);
    expect(views.map((v) => v.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(views[0]!.files.map((x) => x.path)).toEqual(["a.ts", "b.ts", "gone.ts", "extra.ts"]);
    expect(views[0]!.files.find((x) => x.path === "gone.ts")!.patch).toBeNull();
    expect(views[2]!.files).toEqual([]);
    expect(views[3]!.files).toEqual([]);
  });
});

describe("defaultFileOpen", () => {
  it("collapses docs and large files, opens small core files", () => {
    expect(defaultFileOpen("docs", { additions: 1, deletions: 0 })).toBe(false);
    expect(defaultFileOpen("core", { additions: 6, deletions: 4 })).toBe(true);
    expect(defaultFileOpen("core", { additions: 400, deletions: 100 })).toBe(false);
  });
});
