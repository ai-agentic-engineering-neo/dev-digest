import { describe, it, expect } from "vitest";
import { formatUsd } from "./format";

describe("formatUsd", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0.0000"], // free model — distinct from "<$0.0001"
    [0.0000498, "<$0.0001"], // real deepseek-v4-flash run on PR #482
    [0.0001, "$0.0001"],
    [0.0013, "$0.0013"],
    [0.0041445, "$0.0041"],
    [0.014, "$0.0140"], // trailing zero kept: same width as its neighbours
    [0.0213, "$0.0213"],
    [0.06, "$0.0600"],
    [0.99994, "$0.9999"],
    [1.2749, "$1.27"],
    [12, "$12.00"],
  ])("formatUsd(%s) → %s", (input, expected) => {
    expect(formatUsd(input as number | null | undefined)).toBe(expected);
  });

  it("every value under $1 has exactly 4 decimals (columns line up)", () => {
    for (const v of [0.0001, 0.0041, 0.014, 0.06, 0.5]) {
      expect(formatUsd(v)).toMatch(/^\$0\.\d{4}$/);
    }
  });

  it("estimated costs only add ~ — same digits as billed ones; unknown stays —", () => {
    expect(formatUsd(0.00031, { estimated: true })).toBe("~$0.0003");
    expect(formatUsd(0.014, { estimated: true })).toBe("~$0.0140");
    expect(formatUsd(0.00004, { estimated: true })).toBe("~<$0.0001");
    expect(formatUsd(1.5, { estimated: true })).toBe("~$1.50");
    expect(formatUsd(null, { estimated: true })).toBe("—");
    expect(formatUsd(0.014, { estimated: false })).toBe("$0.0140");
  });
});
