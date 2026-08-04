import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

describe("OverviewTab — Intent card (specs/05-intent-layer.md revision 2)", () => {
  it("shows the empty state before a review run has computed an intent", () => {
    render(<OverviewTab prBody={null} />);
    expect(
      screen.getByText("Not yet analyzed — intent is computed on the next review run."),
    ).toBeInTheDocument();
  });

  it("renders the summary quote plus both IN SCOPE / OUT OF SCOPE lists when populated", () => {
    render(
      <OverviewTab
        prBody={null}
        intent="Adds rate limiting to the public API endpoints."
        intentInScope={["Rate limiter middleware", "Config for limiter thresholds"]}
        intentOutOfScope={["Authentication changes"]}
        intentContextGaps={[]}
      />,
    );
    expect(screen.getByText("“Adds rate limiting to the public API endpoints.”")).toBeInTheDocument();
    expect(screen.getByText("✓ IN SCOPE")).toBeInTheDocument();
    expect(screen.getByText("✗ OUT OF SCOPE")).toBeInTheDocument();
    expect(screen.getByText("Rate limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Config for limiter thresholds")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
    // no confidence badge/text anywhere (v1 behaviour removed)
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it("shows 'Nothing stated' for whichever list is empty", () => {
    render(
      <OverviewTab
        prBody={null}
        intent="Fixes a typo in the README."
        intentInScope={["Typo fix in README.md"]}
        intentOutOfScope={[]}
      />,
    );
    expect(screen.getAllByText("Nothing stated")).toHaveLength(1);
  });

  it("renders the Limited context warning line when intentContextGaps is non-empty, and omits it when absent", () => {
    const { rerender } = render(
      <OverviewTab
        prBody={null}
        intent="Unclear from available signals."
        intentInScope={[]}
        intentOutOfScope={[]}
        intentContextGaps={["PR description is empty or near-empty"]}
      />,
    );
    expect(
      screen.getByText("⚠ Limited context: PR description is empty or near-empty"),
    ).toBeInTheDocument();

    rerender(
      <OverviewTab
        prBody={null}
        intent="Unclear from available signals."
        intentInScope={[]}
        intentOutOfScope={[]}
        intentContextGaps={[]}
      />,
    );
    expect(screen.queryByText(/Limited context/)).not.toBeInTheDocument();
  });
});
