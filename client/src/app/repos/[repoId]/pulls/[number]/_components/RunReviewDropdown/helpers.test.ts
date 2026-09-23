import { describe, it, expect } from "vitest";
import {
  defaultSelection,
  isAllSelected,
  runLabel,
  selectAll,
  toggleAgent,
  type SelectableAgent,
} from "./helpers";

const agents: (SelectableAgent & { name: string })[] = [
  { id: "a", name: "Security Reviewer", enabled: true },
  { id: "b", name: "API Contract Reviewer", enabled: false },
  { id: "c", name: "Test Quality Reviewer", enabled: true },
];

describe("defaultSelection", () => {
  it("pre-ticks the enabled agents only — this default IS the old 'run all enabled'", () => {
    expect(defaultSelection(agents)).toEqual(["a", "c"]);
  });

  it("is empty when nothing is enabled, so the footer starts disabled", () => {
    expect(defaultSelection([{ id: "x", enabled: false }])).toEqual([]);
  });
});

describe("toggleAgent", () => {
  it("adds an unticked agent and removes a ticked one", () => {
    expect(toggleAgent(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleAgent(["a", "b"], "a")).toEqual(["b"]);
  });

  it("never produces a duplicate, which would mean running one agent twice", () => {
    expect(toggleAgent(toggleAgent(["a"], "b"), "b")).toEqual(["a"]);
  });
});

describe("selectAll", () => {
  it("takes disabled agents too — an explicit pick runs regardless of `enabled`", () => {
    expect(selectAll(agents)).toEqual(["a", "b", "c"]);
  });
});

describe("isAllSelected", () => {
  it("is false while a disabled agent is still unticked", () => {
    expect(isAllSelected(agents, ["a", "c"])).toBe(false);
  });

  it("is true only once every row is ticked", () => {
    expect(isAllSelected(agents, ["a", "b", "c"])).toBe(true);
  });

  it("is false with no agents at all, so the control never says 'Clear' on an empty list", () => {
    expect(isAllSelected([], [])).toBe(false);
  });
});

describe("runLabel", () => {
  it("names the single agent rather than counting to one", () => {
    expect(runLabel(agents, ["a"])).toEqual({ key: "runOne", values: { name: "Security Reviewer" } });
  });

  it("counts from two upwards", () => {
    expect(runLabel(agents, ["a", "c"])).toEqual({ key: "runMany", values: { count: 2 } });
  });

  it("falls back to the prompt when nothing is selected", () => {
    expect(runLabel(agents, [])).toEqual({ key: "runNone", values: {} });
  });

  it("degrades to the count form for a stale id with no matching agent", () => {
    expect(runLabel(agents, ["gone"])).toEqual({ key: "runMany", values: { count: 1 } });
  });
});
