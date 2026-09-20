import { describe, it, expect } from "vitest";
import { formatUsd } from "./helpers";

describe("formatUsd", () => {
  it("renders '—' for null (unpriced run)", () => {
    expect(formatUsd(null)).toBe("—");
  });

  it("renders '—' for undefined (older run_traces predating cost_usd)", () => {
    expect(formatUsd(undefined)).toBe("—");
  });

  it("uses 4 decimals under $0.01", () => {
    expect(formatUsd(0.0013)).toBe("$0.0013");
  });

  it("uses 3 decimals under $1", () => {
    expect(formatUsd(0.014)).toBe("$0.014");
  });

  it("uses 2 decimals at $1 and above", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
  });

  it("renders zero cost as $0.0000, not '—' (failed runs are zeroed, not unknown)", () => {
    expect(formatUsd(0)).toBe("$0.0000");
  });
});
