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

  it("M1: shows the run cost · tokens badge, and a dash when cost is unknown", () => {
    const base = {
      run_id: "r1", agent_id: "a1", agent_name: "Security Reviewer", provider: "openrouter", model: "m",
      status: "done", error: null, duration_ms: 1, findings_count: 1, grounding: "1/1 passed",
      ran_at: null, score: 42, blockers: 1,
    };
    const props = { verdict: "request_changes" as const, summary: null, score: 42, findingsCount: 1, blockers: 1 };
    const { unmount } = renderWithIntl(
      <VerdictBanner {...props} run={{ ...base, tokens_in: 8200, tokens_out: 1300, cost_usd: 0.014 }} />,
    );
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
    unmount();
    renderWithIntl(<VerdictBanner {...props} run={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("M1: no run prop → no cost badge", () => {
    renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={90} findingsCount={0} blockers={0} />,
    );
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
