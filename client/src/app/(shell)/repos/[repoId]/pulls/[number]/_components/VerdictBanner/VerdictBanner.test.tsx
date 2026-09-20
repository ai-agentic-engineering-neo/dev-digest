import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/prReview.json";
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

  it("shows the cost/tokens row only when costUsd is known", () => {
    const { rerender } = renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary="Looks good."
        score={91}
        findingsCount={0}
        blockers={0}
        costUsd={0.014}
        tokensIn={8200}
        tokensOut={1300}
      />,
    );
    expect(screen.getByText("$0.014 · 8k→1.3k")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <VerdictBanner verdict="approve" summary="Looks good." score={91} findingsCount={0} blockers={0} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
  });
});
