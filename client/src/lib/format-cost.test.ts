import { describe, it, expect } from "vitest";
import { formatUsd, formatUsdPrecise, formatTokenTotal, NO_VALUE } from "./format-cost";

describe("formatUsd", () => {
  it("uses 4 decimals under a cent, 3 under a dollar, 2 otherwise", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(0.06)).toBe("$0.060");
    expect(formatUsd(1.2449)).toBe("$1.24");
  });

  it('renders missing data as "—", never "$0.00"', () => {
    expect(formatUsd(null)).toBe(NO_VALUE);
    expect(formatUsd(undefined)).toBe(NO_VALUE);
    expect(formatUsd(Number.NaN)).toBe(NO_VALUE);
  });

  it("renders a genuine zero cost (free model) as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatUsdPrecise", () => {
  it("keeps 4 significant digits for tooltips", () => {
    expect(formatUsdPrecise(0.00128437)).toBe("$0.001284");
    expect(formatUsdPrecise(null)).toBe(NO_VALUE);
  });
});

describe("formatTokenTotal", () => {
  it("sums in + out with thousands separators", () => {
    expect(formatTokenTotal(8201, 918)).toBe("9,119");
  });

  it("returns null when there is no token data", () => {
    expect(formatTokenTotal(null, null)).toBeNull();
    expect(formatTokenTotal(0, 0)).toBeNull();
  });
});
