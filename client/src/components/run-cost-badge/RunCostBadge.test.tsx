/**
 * RunCostBadge — the money rules: no data reads "—" (never "$0.00"), a free
 * model's genuine zero reads "$0.00", and sub-cent costs keep enough digits to
 * stay visible.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: React.ComponentProps<typeof RunCostBadge>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("renders an em dash for a run with no cost data", () => {
    renderBadge({ costUsd: null });
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("renders a genuine zero as $0.00", () => {
    renderBadge({ costUsd: 0 });
    expect(screen.getByText("$0.00")).toBeTruthy();
  });

  it("scales precision with the amount", () => {
    const cases: [number, string][] = [
      [0.0013, "$0.0013"],
      [0.014, "$0.014"],
      [0.06, "$0.06"], // no pointless trailing zero
      [0.1, "$0.10"], // but never fewer than two decimals
      [1.2345, "$1.23"],
      [0.00001, "<$0.0001"],
    ];
    for (const [usd, expected] of cases) {
      cleanup();
      renderBadge({ costUsd: usd });
      expect(screen.getByText(expected)).toBeTruthy();
    }
  });

  it("detailed variant appends the token flow", () => {
    renderBadge({ costUsd: 0.014, tokensIn: 8200, tokensOut: 1300, variant: "detailed" });
    expect(screen.getByText("$0.014")).toBeTruthy();
    expect(screen.getByText("8.2K→1.3K")).toBeTruthy();
  });

  it("detailed variant omits tokens when they are unknown", () => {
    renderBadge({ costUsd: 0.014, tokensIn: null, tokensOut: null, variant: "detailed" });
    expect(screen.getByText("$0.014")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });
});
