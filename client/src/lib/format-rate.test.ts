import { describe, it, expect } from "vitest";
import { formatRate } from "./format-rate";

describe("formatRate", () => {
  it("formats a 0..1 rate as a whole percent", () => {
    expect(formatRate(0.736)).toBe("74%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
  });
  it("shows an em dash when there is no data", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
});
