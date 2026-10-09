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

  it("shows the run cost + token flow under the score", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary={null}
        score={61}
        findingsCount={6}
        blockers={2}
        costUsd={0.014}
        tokensIn={8200}
        tokensOut={1300}
      />,
    );
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
  });

  it("keeps the cost when the review has no score", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="comment"
        summary={null}
        score={null}
        findingsCount={0}
        blockers={0}
        costUsd={0.014}
        tokensIn={8200}
        tokensOut={1300}
      />,
    );
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
  });

  it("renders nothing for cost when the run was unpriced", () => {
    renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={90} findingsCount={0} blockers={0} costUsd={null} />,
    );
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });
});
