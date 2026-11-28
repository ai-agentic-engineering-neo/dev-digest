import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });
});

describe("VerdictBanner run cost", () => {
  it("shows cost and tokens under the PR score", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="x"
        score={61}
        findingsCount={6}
        blockers={2}
        costUsd={0.014}
        tokensIn={8240}
        tokensOut={1290}
      />,
    );
    const line = screen.getByTestId("run-cost-badge");
    expect(line.textContent).toBe("$0.0148.2K→1.3K");
    expect(line.getAttribute("aria-label")).toBe("Review run cost $0.014");
    expect(screen.getByText("PR SCORE").parentElement!.contains(line)).toBe(true);
  });

  it("hides the cost line when the cost is unknown", () => {
    renderWithIntl(
      <VerdictBanner verdict="comment" summary="x" score={80} findingsCount={0} blockers={0} costUsd={null} />,
    );
    expect(screen.queryByTestId("run-cost-badge")).toBeNull();
  });
});
