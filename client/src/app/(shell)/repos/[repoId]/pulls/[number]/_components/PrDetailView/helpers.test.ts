import { describe, it, expect } from "vitest";
import { parseSeverityParam } from "./helpers";

describe("parseSeverityParam", () => {
  it("accepts a known severity", () => {
    expect(parseSeverityParam("CRITICAL")).toBe("CRITICAL");
  });

  it("reads junk, the wrong case and an absent param as NO filter", () => {
    // A stale or hand-typed link must show everything, not nothing.
    expect(parseSeverityParam("critical")).toBeNull();
    expect(parseSeverityParam("BANANA")).toBeNull();
    expect(parseSeverityParam(null)).toBeNull();
    expect(parseSeverityParam("")).toBeNull();
  });
})
