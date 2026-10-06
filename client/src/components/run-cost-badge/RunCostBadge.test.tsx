import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge, type RunCostBadgeProps } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: RunCostBadgeProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact shows the formatted cost", () => {
    renderBadge({ variant: "compact", usd: 0.014 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("compact shows — when the cost is unknown", () => {
    renderBadge({ variant: "compact", usd: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("detailed shows total tokens and cost, with the exact split in the tooltip", () => {
    renderBadge({ variant: "detailed", usd: 0.00131, tokensIn: 8200, tokensOut: 919 });
    const el = screen.getByText("9,119 tok · $0.00131");
    expect(el).toHaveAttribute("title", "in 8,200 → out 919 tokens · $0.00131");
  });

  it("detailed keeps the tokens and shows — for an unpriced model", () => {
    renderBadge({ variant: "detailed", usd: null, tokensIn: 100, tokensOut: 50 });
    expect(screen.getByText("150 tok · —")).toBeInTheDocument();
  });

  it("detailed renders nothing when the run has no usage", () => {
    const { container } = renderBadge({ variant: "detailed", usd: null, tokensIn: 0, tokensOut: 0 });
    expect(container).toBeEmptyDOMElement();
  });
});
