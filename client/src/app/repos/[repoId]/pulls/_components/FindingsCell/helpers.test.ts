import { describe, it, expect } from "vitest";
import { location, placePopover, popoverFindings } from "./helpers";
import { LATEST_IDS, REVIEWS, finding } from "./fixtures.test-data";

describe("popoverFindings", () => {
  it("keeps only open findings of the rolled-up reviews, most severe then most confident first", () => {
    expect(popoverFindings(REVIEWS, LATEST_IDS).map((f) => f.id)).toEqual(["c-high", "c-low", "w1", "s1"]);
  });

  it("returns [] while reviews or ids are missing", () => {
    expect(popoverFindings(undefined, LATEST_IDS)).toEqual([]);
    expect(popoverFindings(REVIEWS, null)).toEqual([]);
  });
});

describe("location", () => {
  it("formats single lines and ranges", () => {
    expect(location(finding("a", "WARNING", { file: "x.ts", start_line: 4, end_line: 4 }))).toBe("x.ts:4");
    expect(location(finding("a", "WARNING", { file: "x.ts", start_line: 4, end_line: 9 }))).toBe("x.ts:4–9");
  });
});

describe("placePopover", () => {
  const viewport = { width: 1400, height: 800 };
  const size = { width: 380, maxHeight: 420 };

  it("opens below the trigger when there is room", () => {
    expect(placePopover({ left: 100, top: 100, bottom: 120 }, viewport, size)).toEqual({
      left: 100,
      top: 128,
      maxHeight: 420,
    });
  });

  it("flips above the trigger near the bottom of the viewport", () => {
    expect(placePopover({ left: 100, top: 700, bottom: 720 }, viewport, size)).toEqual({
      left: 100,
      bottom: 108,
      maxHeight: 420,
    });
  });

  it("shrinks to the available space so it never runs off-screen (short viewport)", () => {
    // 577px-tall window, trigger mid-screen: neither side fits 420px.
    const p = placePopover({ left: 100, top: 300, bottom: 322 }, { width: 1280, height: 577 }, size);
    expect(p).toEqual({ left: 100, bottom: 285, maxHeight: 284 });
  });

  it("clamps horizontally inside the viewport", () => {
    expect(placePopover({ left: 1300, top: 100, bottom: 120 }, viewport, size).left).toBe(1400 - 380 - 8);
  });
});
