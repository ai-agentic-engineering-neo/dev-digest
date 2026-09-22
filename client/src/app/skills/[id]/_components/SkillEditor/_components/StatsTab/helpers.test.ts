import { describe, it, expect } from "vitest";
import { maxCount, neverAttached } from "./helpers";

describe("StatsTab helpers", () => {
  it("maxCount is at least 1", () => {
    expect(maxCount([])).toBe(1);
    expect(maxCount([{ key: "bug", count: 3 }, { key: "security", count: 7 }])).toBe(7);
  });

  it("neverAttached is true only for zero runs", () => {
    expect(neverAttached(0)).toBe(true);
    expect(neverAttached(2)).toBe(false);
  });
});
