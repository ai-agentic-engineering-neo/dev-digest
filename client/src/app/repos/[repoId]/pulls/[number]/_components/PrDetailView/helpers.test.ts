import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { countFindings, findPrId, parseOrder, parseTab, prDetailPath, withSearchParam } from "./helpers";

describe("findPrId", () => {
  const pulls = [
    { id: "u1", number: 1 },
    { id: "u7", number: 7 },
  ];
  it("resolves the route's PR number to the row uuid", () => {
    expect(findPrId(pulls, "7")).toBe("u7");
  });
  it("is null when the list is not loaded or has no such PR", () => {
    expect(findPrId(undefined, "7")).toBeNull();
    expect(findPrId(pulls, "9")).toBeNull();
    expect(findPrId([{ id: null, number: 7 }], "7")).toBeNull();
  });
});

describe("countFindings", () => {
  it("sums findings across runs", () => {
    const reviews = [{ findings: [{}, {}] }, { findings: [{}] }] as unknown as ReviewRecord[];
    expect(countFindings(reviews)).toBe(3);
    expect(countFindings(undefined)).toBe(0);
  });
});

describe("parseTab", () => {
  it("accepts known tabs and falls back to overview", () => {
    expect(parseTab("diff")).toBe("diff");
    expect(parseTab("findings")).toBe("findings");
    expect(parseTab(null)).toBe("overview");
    expect(parseTab("bogus")).toBe("overview");
  });
});

describe("parseOrder", () => {
  it("accepts smart/original and falls back to smart", () => {
    expect(parseOrder("smart")).toBe("smart");
    expect(parseOrder("original")).toBe("original");
    expect(parseOrder(null)).toBe("smart");
    expect(parseOrder("bogus")).toBe("smart");
  });
});

describe("withSearchParam", () => {
  it("sets, replaces and removes a param, keeping the others", () => {
    expect(withSearchParam("", "tab", "diff")).toBe("?tab=diff");
    expect(withSearchParam("tab=diff&trace=r1", "tab", "findings")).toBe("?tab=findings&trace=r1");
    expect(withSearchParam("tab=diff&trace=r1", "trace", null)).toBe("?tab=diff");
    expect(withSearchParam("trace=r1", "trace", null)).toBe("");
  });
});

describe("prDetailPath", () => {
  it("builds the route path", () => {
    expect(prDetailPath("r1", "7")).toBe("/repos/r1/pulls/7");
  });
});
