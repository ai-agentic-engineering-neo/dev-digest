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

  it("shows the run cost line when run data is provided", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary={null}
        score={92}
        findingsCount={0}
        blockers={0}
        run={{ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 }}
      />,
    );
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("shows — for a run without cost/token data (never $0.00)", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary={null}
        score={92}
        findingsCount={0}
        blockers={0}
        run={null}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
