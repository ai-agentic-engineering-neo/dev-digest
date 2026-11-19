import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import { formatCost } from "../../helpers";
import { RunCostBadge, type RunCostBadgeVariant } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: {
  variant: RunCostBadgeVariant;
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it("uses adaptive precision", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
    expect(formatCost(1.25)).toBe("$1.25");
  });

  it("returns '—' for no data, never '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("keeps a real zero as '$0' and never rounds a tiny positive to $0.0000", () => {
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.00001)).toBe("<$0.0001");
  });
});

describe("RunCostBadge", () => {
  it("cost variant → compact cost only", () => {
    renderBadge({ variant: "cost", costUsd: 0.014, tokensIn: 5, tokensOut: 5 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("timeline variant → 'N tok · $cost' with thousands separators", () => {
    renderBadge({ variant: "timeline", costUsd: 0.0013, tokensIn: 8000, tokensOut: 1119 });
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("inout variant → '$cost · in→out'", () => {
    renderBadge({ variant: "inout", costUsd: 0.014, tokensIn: 8200, tokensOut: 1300 });
    expect(screen.getByText("$0.014 · 8k→1.3k")).toBeInTheDocument();
  });

  it("null cost → '—' in every variant (no tokens)", () => {
    for (const variant of ["cost", "timeline", "inout"] as const) {
      renderBadge({ variant, costUsd: null });
      expect(screen.getByText("—")).toBeInTheDocument();
      cleanup();
    }
  });

  it("timeline with tokens but no cost → 'N tok · —'", () => {
    renderBadge({ variant: "timeline", costUsd: null, tokensIn: 100, tokensOut: 50 });
    expect(screen.getByText("150 tok · —")).toBeInTheDocument();
  });

  it("a real zero cost renders '$0'", () => {
    renderBadge({ variant: "cost", costUsd: 0 });
    expect(screen.getByText("$0")).toBeInTheDocument();
  });
});
