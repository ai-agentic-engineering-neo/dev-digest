import { describe, it, expect } from "vitest";
import { withSearchParam } from "./search-params";

describe("withSearchParam", () => {
  it("sets a new key while keeping the others", () => {
    expect(withSearchParam("tab=diff", "trace", "r1")).toBe("tab=diff&trace=r1");
  });

  it("overwrites an existing key", () => {
    expect(withSearchParam("status=all&x=1", "status", "stale")).toBe("status=stale&x=1");
  });

  it("removes the key when value is null", () => {
    expect(withSearchParam("tab=diff&trace=r1", "trace", null)).toBe("tab=diff");
    expect(withSearchParam("trace=r1", "trace", null)).toBe("");
  });
});
