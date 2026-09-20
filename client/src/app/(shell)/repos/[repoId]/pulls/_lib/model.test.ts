import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import { OPEN_STATUSES, sizeOf } from "./model";

function pr(additions: number, deletions: number): PrMeta {
  return { additions, deletions } as PrMeta;
}

describe("sizeOf", () => {
  it("buckets S below SIZE_SMALL_MAX", () => {
    expect(sizeOf(pr(50, 49))).toEqual({ size: "S", lines: 99 });
  });

  it("buckets M at the S/M boundary (inclusive of SIZE_SMALL_MAX)", () => {
    expect(sizeOf(pr(100, 0))).toEqual({ size: "M", lines: 100 });
  });

  it("buckets L at the M/L boundary (inclusive of SIZE_MEDIUM_MAX)", () => {
    expect(sizeOf(pr(400, 0))).toEqual({ size: "L", lines: 400 });
  });
});

describe("OPEN_STATUSES", () => {
  it("treats needs_review/reviewed/stale as open, merged/closed as not", () => {
    expect(OPEN_STATUSES.has("needs_review")).toBe(true);
    expect(OPEN_STATUSES.has("reviewed")).toBe(true);
    expect(OPEN_STATUSES.has("stale")).toBe(true);
    expect(OPEN_STATUSES.has("merged")).toBe(false);
    expect(OPEN_STATUSES.has("closed")).toBe(false);
  });
});
