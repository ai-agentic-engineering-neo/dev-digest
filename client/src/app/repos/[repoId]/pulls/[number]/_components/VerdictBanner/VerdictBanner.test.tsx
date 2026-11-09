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

describe("VerdictBanner (slots)", () => {
  it("renders body and titleAside instead of the summary, with kit score colouring", () => {
    const { container } = renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Review summary that must not show."
        score={61}
        findingsCount={6}
        blockers={2}
        body={<p>brief text</p>}
        titleAside={<button type="button">i</button>}
        stackOnNarrow
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/6 findings · 2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText("brief text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "i" })).toBeInTheDocument();
    expect(screen.queryByText(/must not show/)).not.toBeInTheDocument();
    expect(container.querySelector('circle[stroke="var(--warn)"]')).not.toBeNull();
  });

  it("omits the score and the blocker part when absent", () => {
    renderWithIntl(
      <VerdictBanner verdict="comment" summary={null} score={null} findingsCount={0} blockers={0} />,
    );
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });
});
