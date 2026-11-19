import { describe, it, expect } from "vitest";
import { formatUsd, formatTokensK, formatTokenTotal } from "./format-cost";

describe("formatUsd", () => {
  it("renders no-data as an em dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
  it("renders a real zero (free model) as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
  it("scales precision with magnitude", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.06)).toBe("$0.060");
    expect(formatUsd(1.25)).toBe("$1.25");
  });
});

describe("formatTokensK", () => {
  it("formats in→out compactly", () => {
    expect(formatTokensK(8200, 1300)).toBe("8.2K→1.3K");
    expect(formatTokensK(950, 40)).toBe("950→40");
    expect(formatTokensK(1_250_000, 2000)).toBe("1.3M→2K");
    expect(formatTokensK(12000, 1500)).toBe("12K→1.5K");
  });
});

describe("formatTokenTotal", () => {
  it("groups thousands with a space", () => {
    expect(formatTokenTotal(9119)).toBe("9 119");
    expect(formatTokenTotal(12011)).toBe("12 011");
    expect(formatTokenTotal(512)).toBe("512");
    expect(formatTokenTotal(1234567)).toBe("1 234 567");
  });
});
