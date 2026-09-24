import { describe, it, expect, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithProviders(
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
    expect(screen.getByText(/1 finding · 1 blocker/)).toBeInTheDocument();
  });
});

describe("VerdictBanner — run cost row", () => {
  const base = {
    verdict: "request_changes" as const,
    summary: null,
    score: 38,
    findingsCount: 3,
    blockers: 2,
  };

  it("shows cost + tokens under PR SCORE when the review has run usage", () => {
    renderWithProviders(<VerdictBanner {...base} costUsd={0.0013} tokensIn={9119} tokensOut={1240} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
    expect(screen.getByText("9k→1.2k")).toBeInTheDocument();
  });

  it("unknown cost shows a dash next to the tokens", () => {
    renderWithProviders(<VerdictBanner {...base} costUsd={null} tokensIn={9119} tokensOut={1240} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("9k→1.2k")).toBeInTheDocument();
  });

  it("no run usage → no cost row", () => {
    renderWithProviders(<VerdictBanner {...base} />);
    expect(screen.queryByText(/k→/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
