import { describe, expect, it } from "vitest";
import type { FindingRecord, RunSummary, ReviewRecord } from "@devdigest/shared";
import { conflictFindingIds, countedColumns, findConflicts } from "./conflicts";
import type { AgentColumnView } from "./types";

function f(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: `title-${id}`,
    file: "a.ts",
    start_line: 10,
    end_line: 12,
    rationale: "",
    confidence: 0.5,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function done(id: string, findings: FindingRecord[]): AgentColumnView {
  return {
    agent: { id, name: `Name ${id}`, model: "m", colorIndex: 1 },
    state: { kind: "done", run: {} as RunSummary, review: {} as ReviewRecord },
    findings,
  };
}

function other(id: string, kind: "failed" | "cancelled" | "running" | "starting"): AgentColumnView {
  const agent = { id, name: `Name ${id}`, model: "m", colorIndex: 1 };
  const run = {} as RunSummary;
  const state: AgentColumnView["state"] = kind === "starting" ? { kind } : { kind, run };
  return { agent, state, findings: [f(`${id}-hidden`)] };
}

describe("findConflicts", () => {
  it("merges overlapping ranges transitively but not adjacent ranges or other files", () => {
    const a = done("a", [f("a1", { start_line: 1, end_line: 5 }), f("a2", { start_line: 6, end_line: 8 })]);
    const b = done("b", [f("b1", { start_line: 5, end_line: 6 })]);
    // a1(1-5) overlaps b1(5-6), b1 overlaps a2(6-8) -> one location with both agents flagging at WARNING
    // => not a conflict; make c ignore it to prove a single merged location
    const c = done("c", []);
    const conflicts = findConflicts([a, b, c]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.line).toBe(1);
    expect(conflictFindingIds([a, b, c])).toEqual(new Set(["a1", "a2", "b1"]));

    // adjacent (1-5 vs 6-8) and different files stay separate locations
    const a2 = done("a", [f("x1", { start_line: 1, end_line: 5 })]);
    const b2 = done("b", [f("x2", { start_line: 6, end_line: 8 }), f("x3", { file: "z.ts", start_line: 1 })]);
    const result = findConflicts([a2, b2]);
    expect(result.map((x) => `${x.file}:${x.line}`)).toEqual(["a.ts:1", "a.ts:6", "z.ts:1"]);
  });

  it("flags did-not-flag and differing severities, not agreement", () => {
    const agree = findConflicts([done("a", [f("1")]), done("b", [f("2")])]);
    expect(agree).toEqual([]);

    const differ = findConflicts([
      done("a", [f("1", { severity: "CRITICAL" })]),
      done("b", [f("2", { severity: "SUGGESTION" })]),
    ]);
    expect(differ).toHaveLength(1);

    const missing = findConflicts([done("a", [f("1")]), done("b", [f("2")]), done("c", [])]);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.takes.map((t) => t.verdict)).toEqual(["WARNING", "WARNING", "ignored"]);
  });

  it("counts only done columns and needs at least two", () => {
    const a = done("a", [f("1")]);
    expect(findConflicts([a, other("b", "failed")])).toEqual([]);
    expect(findConflicts([a])).toEqual([]);
    expect(conflictFindingIds([a, other("b", "running")]).size).toBe(0);
    const columns = [a, other("b", "cancelled"), other("c", "starting"), done("d", [])];
    expect(countedColumns(columns).map((c) => c.agent.id)).toEqual(["a", "d"]);
    const conflicts = findConflicts(columns);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.takes.map((t) => t.agent_id)).toEqual(["a", "d"]);
  });

  it("builds line, title and takes in column order", () => {
    const columns = [
      done("a", [f("1", { start_line: 20, end_line: 25, severity: "WARNING", title: "warn it" })]),
      done("b", [
        f("2", { start_line: 15, end_line: 21, severity: "CRITICAL", title: "crit it" }),
        f("3", { start_line: 16, end_line: 17, severity: "SUGGESTION", title: "minor" }),
      ]),
      done("c", []),
    ];
    const [conflict] = findConflicts(columns);
    expect(conflict?.line).toBe(15);
    expect(conflict?.title).toBe("crit it");
    expect(conflict?.takes).toEqual([
      { agent_id: "a", persona: "Name a", verdict: "WARNING", note: "warn it" },
      { agent_id: "b", persona: "Name b", verdict: "CRITICAL", note: "crit it" },
      { agent_id: "c", persona: "Name c", verdict: "ignored", note: "" },
    ]);
  });

  it("returns exactly the findings inside conflicting locations", () => {
    const columns = [
      done("a", [f("agree", { file: "x.ts", start_line: 1, end_line: 1 }), f("only-a", { file: "y.ts", start_line: 3, end_line: 3 })]),
      done("b", [f("agree-b", { file: "x.ts", start_line: 1, end_line: 1 })]),
    ];
    expect(conflictFindingIds(columns)).toEqual(new Set(["only-a"]));
  });
});
