import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCostUsd, formatTokens } from "./format";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCostUsd", () => {
  it("keeps enough digits to read: $0.012 not $0.01", () => {
    expect(formatCostUsd(0.012)).toBe("$0.012");
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.041)).toBe("$0.041");
    expect(formatCostUsd(0.5)).toBe("$0.500");
  });
  it("never collapses a tiny real cost to $0.00 / $0.001", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.0013");
    expect(formatCostUsd(0.00999)).toBe("$0.010");
    expect(formatCostUsd(0.00002)).toBe("<$0.0001");
  });
  it("uses cents above $1, including values that round up to $1", () => {
    expect(formatCostUsd(1.5)).toBe("$1.50");
    expect(formatCostUsd(0.9996)).toBe("$1.00");
  });
  it("a real zero is $0.000, but no data is --", () => {
    expect(formatCostUsd(0)).toBe("$0.000");
    expect(formatCostUsd(null)).toBe("--");
    expect(formatCostUsd(undefined)).toBe("--");
    expect(formatCostUsd(Number.NaN)).toBe("--");
    expect(formatCostUsd(-1)).toBe("--");
  });
});

describe("formatTokens", () => {
  it("compacts to K / M with one decimal", () => {
    expect(formatTokens(8200)).toBe("8.2K");
    expect(formatTokens(1300)).toBe("1.3K");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1_250_000)).toBe("1.3M");
    expect(formatTokens(999_990)).toBe("1.0M");
    expect(formatTokens(null)).toBe("--");
  });
});

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    renderWithIntl(<RunCostBadge variant="compact" costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.012");
  });
  it("banner: cost – tokens in → tokens out, tokens in their own muted span", () => {
    renderWithIntl(<RunCostBadge variant="banner" costUsd={0.014} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.014 – 8.2K → 1.3K");
    expect(screen.getByText("– 8.2K → 1.3K").tagName).toBe("SPAN");
  });
  it("banner without token counts shows the cost alone", () => {
    renderWithIntl(<RunCostBadge variant="banner" costUsd={0.014} />);
    expect(screen.getByTitle("Cost of this run").textContent).toBe("$0.014");
  });
  it.each(["compact", "banner"] as const)("%s: no cost data renders -- and never $0.00", (variant) => {
    renderWithIntl(<RunCostBadge variant={variant} costUsd={null} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByTitle("No cost data").textContent).toBe("--");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
