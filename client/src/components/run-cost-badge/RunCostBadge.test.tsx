import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge, type RunCostBadgeProps } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: RunCostBadgeProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact: renders the cost", () => {
    renderBadge({ variant: "compact", costUsd: 0.014 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("compact: renders '—' (not $0.00) when cost is unknown", () => {
    renderBadge({ variant: "compact", costUsd: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("inline: renders total tokens · cost with a detailed tooltip", () => {
    renderBadge({ variant: "inline", costUsd: 0.001284, tokensIn: 8201, tokensOut: 918 });
    const el = screen.getByText("9,119 tok · $0.0013");
    expect(el).toHaveAttribute("title", "$0.001284 · 8,201 in / 918 out");
  });

  it("inline: tokens only (unpriced model) → '… tok · —'", () => {
    renderBadge({ variant: "inline", costUsd: null, tokensIn: 100, tokensOut: 50 });
    expect(screen.getByText("150 tok · —")).toBeInTheDocument();
  });

  it("inline: no data at all → '—'", () => {
    renderBadge({ variant: "inline", costUsd: null, tokensIn: null, tokensOut: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
