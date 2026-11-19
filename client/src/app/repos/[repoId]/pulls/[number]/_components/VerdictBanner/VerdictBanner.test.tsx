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

  it("shows the run's cost · tokens line when cost is passed (M1)", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="comment"
        summary={null}
        score={70}
        findingsCount={2}
        blockers={0}
        cost={{ costUsd: 0.014, tokensIn: 8200, tokensOut: 1300 }}
      />,
    );
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("$0.014 · 8.2K→1.3K");
  });

  it("renders no cost line when cost is omitted", () => {
    renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={95} findingsCount={0} blockers={0} />,
    );
    expect(screen.queryByTestId("run-cost-badge")).not.toBeInTheDocument();
  });
});
