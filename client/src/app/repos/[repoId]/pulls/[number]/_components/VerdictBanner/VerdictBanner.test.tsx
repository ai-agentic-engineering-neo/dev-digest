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

  const base = { verdict: "comment", summary: null, score: null, findingsCount: 0, blockers: 0 } as const;

  it("shows the run cost badge: cost · in→out tokens", () => {
    renderWithIntl(
      <VerdictBanner {...base} usage={{ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 }} />,
    );
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.014 · 8.2K→1.3K");
  });

  it("shows a dash, not $0.00, when the run has no usage data", () => {
    renderWithIntl(<VerdictBanner {...base} />);
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^—$/);
  });
});
