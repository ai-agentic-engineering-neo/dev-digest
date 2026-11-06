import { describe, expect, it } from "vitest";
import { multiAgentHref, parseMultiAgentSearch, type MultiAgentUrlState } from "./multi-agent-url";

const parse = (qs: string) => parseMultiAgentSearch(new URLSearchParams(qs));

describe("parseMultiAgentSearch", () => {
  it("returns defaults and validates pr/phase/view", () => {
    expect(parse("")).toEqual({ pr: null, agents: null, phase: "config", view: "columns" });
    expect(parse("pr=abc").pr).toBeNull();
    expect(parse("pr=-3").pr).toBeNull();
    expect(parse("pr=0").pr).toBeNull();
    expect(parse("pr=42").pr).toBe(42);
    expect(parse("phase=RESULTS").phase).toBe("config");
    expect(parse("phase=results").phase).toBe("results");
    expect(parse("view=grid").view).toBe("columns");
    expect(parse("view=tabs").view).toBe("tabs");
  });

  it("distinguishes absent, empty and listed agents", () => {
    expect(parse("").agents).toBeNull();
    expect(parse("agents=").agents).toEqual([]);
    expect(parse("agents=a,,b,a").agents).toEqual(["a", "b"]);
  });
});

describe("multiAgentHref", () => {
  it("omits defaults and round-trips", () => {
    expect(multiAgentHref("r 1", {})).toBe("/repos/r%201/multi-agent");
    expect(multiAgentHref("r", { pr: null, phase: "config", view: "columns" })).toBe("/repos/r/multi-agent");
    expect(multiAgentHref("r", { agents: [] })).toBe("/repos/r/multi-agent?agents=");

    const state: MultiAgentUrlState = { pr: 7, agents: ["a", "b"], phase: "results", view: "tabs" };
    const href = multiAgentHref("r", state);
    expect(href).toBe("/repos/r/multi-agent?pr=7&agents=a,b&phase=results&view=tabs");
    expect(parse(href.split("?")[1] ?? "")).toEqual(state);
  });
});
