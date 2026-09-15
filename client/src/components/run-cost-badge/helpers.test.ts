import { describe, it, expect } from "vitest";
import { formatTokensK, formatUsd } from "./helpers";

describe("formatUsd", () => {
  it("renders missing data as an em-dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("renders a real zero (free model) as $0", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  it("below $1: up to 4 decimals with trailing zeros trimmed", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.1)).toBe("$0.1");
    expect(formatUsd(0.01234567)).toBe("$0.0123");
  });

  it("from $1: 2 decimals", () => {
    expect(formatUsd(1.2449)).toBe("$1.24");
    expect(formatUsd(12)).toBe("$12.00");
    expect(formatUsd(0.99996)).toBe("$1.00");
  });

  it("a nonzero cost that rounds to zero reads <$0.0001", () => {
    expect(formatUsd(0.00001)).toBe("<$0.0001");
  });
});

describe("formatTokensK", () => {
  it("keeps small counts, compacts thousands", () => {
    expect(formatTokensK(950)).toBe("950");
    expect(formatTokensK(8200)).toBe("8.2K");
    expect(formatTokensK(1240)).toBe("1.2K");
  });
});
