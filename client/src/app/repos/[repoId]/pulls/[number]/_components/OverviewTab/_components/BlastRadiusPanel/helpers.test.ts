import { describe, it, expect } from "vitest";
import { canResync, isMapComputed, symbolsWithoutCallers } from "./helpers";

describe("blast panel helpers", () => {
  it("canResync only for partial/failed index", () => {
    expect(canResync("index_partial")).toBe(true);
    expect(canResync("index_failed")).toBe(true);
    expect(canResync("no_data")).toBe(false);
    expect(canResync("flag_off")).toBe(false);
    expect(canResync(null)).toBe(false);
  });

  it("isMapComputed is false for no_data / index_failed", () => {
    expect(isMapComputed({ degraded: false, reason: null })).toBe(true);
    expect(isMapComputed({ degraded: true, reason: "index_partial" })).toBe(true);
    expect(isMapComputed({ degraded: true, reason: "flag_off" })).toBe(true);
    expect(isMapComputed({ degraded: true, reason: "no_data" })).toBe(false);
    expect(isMapComputed({ degraded: true, reason: "index_failed" })).toBe(false);
  });

  it("symbolsWithoutCallers never goes negative", () => {
    const counts = { symbols: 3, callers: 0, endpoints: 0, crons: 0 };
    expect(symbolsWithoutCallers({ counts, downstream: [] })).toBe(3);
    expect(symbolsWithoutCallers({ counts: { ...counts, symbols: 0 }, downstream: [{} as never] })).toBe(0);
  });
});
