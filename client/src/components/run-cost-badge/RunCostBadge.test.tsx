import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost } from "@/lib/format-cost";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it("scales precision with magnitude", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.2)).toBe("$1.20");
  });
  it("renders unknown cost as a dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });
});

describe("RunCostBadge", () => {
  it("compact shows only the cost", () => {
    renderBadge(<RunCostBadge costUsd={0.014} tokens={9119} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed shows tokens and cost", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={0.0013} tokens={9119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("shows a dash when nothing is known", () => {
    renderBadge(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
