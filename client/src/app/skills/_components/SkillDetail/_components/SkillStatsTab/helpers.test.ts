import { describe, it, expect } from "vitest";
import { arcPath, buildSegments, formatPercent } from "./helpers";

describe("formatPercent", () => {
  it("rounds to an integer percent", () => {
    expect(formatPercent(0.7449)).toBe("74");
    expect(formatPercent(0.745)).toBe("75");
    expect(formatPercent(0)).toBe("0");
    expect(formatPercent(1)).toBe("100");
  });
  it("returns null for null", () => expect(formatPercent(null)).toBeNull());
});

describe("buildSegments", () => {
  it("sorts by count and assigns stable colours", () => {
    const segs = buildSegments([{ category: "bug", count: 2 }, { category: "security", count: 5 }]);
    expect(segs.map((s) => s.category)).toEqual(["security", "bug"]);
    expect(segs[0]!.color).not.toBe(segs[1]!.color);
  });
  it("buckets beyond 6 into other", () => {
    const cats = Array.from({ length: 8 }, (_, i) => ({ category: `c${i}`, count: 10 - i }));
    const segs = buildSegments(cats);
    expect(segs).toHaveLength(7);
    const other = segs[6]!;
    expect(other.isOther).toBe(true);
    expect(other.count).toBe(4 + 3);
  });
  it("spans a full circle and drops zero counts", () => {
    const segs = buildSegments([{ category: "a", count: 1 }, { category: "b", count: 3 }, { category: "z", count: 0 }]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.start).toBe(0);
    expect(segs.at(-1)!.end).toBeCloseTo(2 * Math.PI, 10);
    expect(segs[0]!.end).toBe(segs[1]!.start);
  });
  it("handles empty input", () => expect(buildSegments([])).toEqual([]));
});

describe("arcPath", () => {
  it("builds a closed path", () => {
    expect(arcPath(50, 50, 40, 25, 0, Math.PI / 2)).toMatch(/^M .* Z$/);
  });
  it("uses the large-arc flag past a half circle", () => {
    expect(arcPath(50, 50, 40, 25, 0, 1.5 * Math.PI)).toContain("0 1 1");
  });
  it("a full-circle segment does not collapse to a point", () => {
    const d = arcPath(50, 50, 40, 25, 0, 2 * Math.PI);
    const m = d.match(/^M (\S+) (\S+) A .* (\S+) (\S+) L/)!;
    expect(m[1] === m[3] && m[2] === m[4]).toBe(false);
  });
});
