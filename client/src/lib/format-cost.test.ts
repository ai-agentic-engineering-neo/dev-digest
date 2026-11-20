import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0.00"],
    [0.0013, "$0.0013"],
    [0.014, "$0.014"],
    [0.06, "$0.060"],
    [1.2749, "$1.27"],
    [12, "$12.00"],
  ])("%s → %s", (usd, expected) => {
    expect(formatCost(usd as number | null | undefined)).toBe(expected);
  });
});
