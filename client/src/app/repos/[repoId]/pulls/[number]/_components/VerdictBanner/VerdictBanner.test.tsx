import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
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

  it("shows run cost · tokens under PR SCORE (M1)", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="comment"
        summary={null}
        score={64}
        findingsCount={2}
        blockers={0}
        cost={{ usd: 0.0142, tokensIn: 8200, tokensOut: 1300 }}
      />,
    );
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText(/8\.2K→1\.3K/)).toBeInTheDocument();
  });

  it("unknown run cost shows an em-dash", () => {
    renderWithIntl(
      <VerdictBanner verdict="comment" summary={null} score={64} findingsCount={0} blockers={0} cost={{ usd: null }} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
