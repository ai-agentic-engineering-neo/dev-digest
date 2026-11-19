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

  const base = {
    verdict: "comment" as const,
    summary: null,
    score: 70,
    findingsCount: 0,
    blockers: 0,
  };

  it("shows the cost · tokens line when the run is passed", () => {
    renderWithIntl(
      <VerdictBanner {...base} run={{ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 }} />,
    );
    expect(screen.getByText("$0.014 · 8k→1.3k")).toBeInTheDocument();
  });

  it("shows '—' (not $0.00) when the run has no cost data", () => {
    renderWithIntl(<VerdictBanner {...base} run={{ cost_usd: null, tokens_in: null, tokens_out: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows no cost line when no run is passed", () => {
    renderWithIntl(<VerdictBanner {...base} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
