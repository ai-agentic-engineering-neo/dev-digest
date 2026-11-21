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
  it("compact shows the cost only", () => {
    renderBadge({ costUsd: 0.0142 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("unknown cost renders an em dash, never $0.00", () => {
    renderBadge({ costUsd: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("detailed shows total tokens and cost", () => {
    renderBadge({ costUsd: 0.014, variant: "detailed", tokensIn: 8000, tokensOut: 1119 });
    expect(screen.getByText("9,119 tok · $0.014")).toBeInTheDocument();
  });

  it("detailed without tokens falls back to the cost only", () => {
    renderBadge({ costUsd: null, variant: "detailed", tokensIn: 0, tokensOut: 0 });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("costs of a dollar or more use 2 decimals", () => {
    renderBadge({ costUsd: 1.234 });
    expect(screen.getByText("$1.23")).toBeInTheDocument();
  });
});
