import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import messages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { ApiError } from "@/lib/api";
import type { PrBriefResponse, StoredBrief } from "@/lib/types";
import { PrBriefCard } from "./PrBriefCard";
import type { BriefVerdict } from "./types";

const READY: BriefVerdict = {
  state: "ready",
  verdict: "request_changes",
  score: 61,
  findings: 6,
  blockers: 2,
  agentName: "Security Reviewer",
  reviewedAt: "2026-11-09T10:00:00.000Z",
};

afterEach(cleanup);

const BRIEF: StoredBrief = {
  summary: "Adds <b>x</b> to config",
  risks: [],
  review_focus: [],
  missing_inputs: [
    { input: "intent", reason: "not_derived" },
    { input: "blast", reason: "index_failed" },
    { input: "smart_diff_roles", reason: "not_in_build" },
  ],
  truncated: { spec_docs: 2, callers: 31, boilerplate_hunk_files: 0 },
  head_sha: "abcdef1234",
  blast_link_sha: null,
  usage: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", tokens_in: 1234, tokens_out: 210, cost_usd: null },
  generated_at: "2026-11-09T10:00:00.000Z",
};

function makeData(over: Partial<PrBriefResponse> = {}): PrBriefResponse {
  return {
    pr_id: "p1",
    model: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
    changed_files: 3,
    generating: false,
    outdated: false,
    brief: null,
    ...over,
  };
}

function renderCard(props: Partial<ComponentProps<typeof PrBriefCard>> = {}) {
  const onGenerate = vi.fn();
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ brief: messages, prReview: prReviewMessages }}>
      <PrBriefCard
        data={makeData()}
        loadError={false}
        generating={false}
        generateError={null}
        onGenerate={onGenerate}
        onRetryLoad={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onGenerate;
}

describe("PrBriefCard", () => {
  it("offers Generate when there is no brief and calls onGenerate once", () => {
    const onGenerate = renderCard();
    expect(screen.getByText("No brief yet.")).toBeInTheDocument();
    expect(screen.getByText("Risk Brief model: deepseek/deepseek-v4-flash")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows a status and disables the button while generating, keeping the old summary", () => {
    renderCard({ data: makeData({ brief: BRIEF }), generating: true });
    expect(screen.getByRole("status")).toHaveTextContent("Generating brief…");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("Adds <b>x</b> to config")).toBeInTheDocument();
  });

  it("shows the generating state for a run started in another tab (caller passes data.generating as generating)", () => {
    // PrBriefCard receives the already-computed `generating` (mutation pending OR data.generating);
    // the OR is the caller's (OverviewTab) job.
    renderCard({ data: makeData({ generating: true }), generating: true });
    expect(screen.getByRole("status")).toHaveTextContent("Generating brief…");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.queryByText("No brief yet.")).not.toBeInTheDocument();
  });

  it("keeps the previous summary visible next to the error alert and Retry", () => {
    renderCard({
      data: makeData({ brief: BRIEF }),
      generateError: new ApiError("x", 502, "brief_generation_failed", { reason: "timeout" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Brief generation failed");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByText("Adds <b>x</b> to config")).toBeInTheDocument();
  });

  it("shows the formatted cost and the generated date in the meta line", () => {
    const priced: StoredBrief = { ...BRIEF, usage: { ...BRIEF.usage, cost_usd: 0.0123 } };
    renderCard({ data: makeData({ brief: priced }) });
    expect(
      screen.getByText(
        "deepseek/deepseek-v4-flash · 1,234 → 210 tok · $0.012 · generated for abcdef1 · Nov 9, 2026, 10:00 AM",
      ),
    ).toBeInTheDocument();
  });

  it("renders notes, meta and the outdated marker for a stored brief", () => {
    const onGenerate = renderCard({ data: makeData({ brief: BRIEF, outdated: true }) });
    expect(screen.getByText("Outdated — generated for abcdef1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByText("Intent unavailable — not derived yet")).toBeInTheDocument();
    expect(
      screen.getByText("Blast radius unavailable — The last indexing run failed — callers may be missing or outdated."),
    ).toBeInTheDocument();
    expect(screen.getByText("Smart Diff roles unavailable — not in this build")).toBeInTheDocument();
    expect(screen.getByText("Truncated: 2 spec docs, 31 callers")).toBeInTheDocument();
    expect(screen.getByText(/1,234 → 210 tok · cost n\/a · generated for abcdef1/)).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("disables the action when the PR has no changed files", () => {
    renderCard({ data: makeData({ changed_files: 0 }) });
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.getByText("This PR has no changed files — nothing to brief")).toBeInTheDocument();
  });

  it("maps generation errors to an alert with Retry or a Settings link", () => {
    const onGenerate = renderCard({
      data: makeData({ brief: BRIEF }),
      generateError: new ApiError("x", 502, "brief_generation_failed", { reason: "timeout" }),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Brief generation failed: the model call took longer than 60 s",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    cleanup();

    renderCard({ generateError: new ApiError("x", 422, "brief_model_not_configured", { provider: "openrouter" }) });
    expect(screen.getByText("Risk Brief model not configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
    cleanup();

    renderCard({ generateError: new ApiError("x", 422, "brief_too_large", { tokens: 9120, limit: 8000 }) });
    expect(screen.getByRole("alert")).toHaveTextContent("PR too large for brief — 9,120 / 8,000 tokens");
  });

  it("wraps the brief in a verdict banner under the PR Brief label and keeps it in every state", () => {
    renderCard({ data: makeData({ brief: BRIEF }), verdict: READY });
    const heading = screen.getByRole("heading", { name: "PR Brief" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/6 findings/)).toHaveTextContent("2 blockers");
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText("Adds <b>x</b> to config")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Security Reviewer's review run of/ })).toBeInTheDocument();
    cleanup();

    renderCard({ verdict: READY });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("No brief yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
    cleanup();

    renderCard({ data: makeData({ brief: BRIEF, outdated: true }), verdict: READY });
    expect(screen.getByText("Outdated — generated for abcdef1")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });

  it("shows no verdict UI without a finished run, and an alert with Retry on a verdict error", () => {
    renderCard({ verdict: { state: "none" } });
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review run of/ })).not.toBeInTheDocument();
    cleanup();

    const onRetryVerdict = vi.fn();
    const onGenerate = renderCard({ verdict: { state: "error" }, onRetryVerdict });
    expect(screen.getByText("Review verdict unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading the review verdict" }));
    expect(onRetryVerdict).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  const BANNER_CASES: Array<{
    name: string;
    props: Partial<ComponentProps<typeof PrBriefCard>>;
    expectBody: () => void;
  }> = [
    {
      name: "no brief",
      props: {},
      expectBody: () => {
        expect(screen.getByText("No brief yet.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
        expect(screen.getByText("Risk Brief model: deepseek/deepseek-v4-flash")).toBeInTheDocument();
      },
    },
    {
      name: "generating",
      props: { data: makeData({ generating: true }), generating: true },
      expectBody: () => {
        expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent("Generating brief…");
      },
    },
    {
      name: "generation failed",
      props: { generateError: new ApiError("x", 502, "brief_generation_failed", { reason: "timeout" }) },
      expectBody: () => {
        expect(screen.getByRole("alert")).toHaveTextContent("Brief generation failed");
        expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
      },
    },
    {
      name: "outdated",
      props: { data: makeData({ brief: BRIEF, outdated: true }) },
      expectBody: () => {
        expect(screen.getByText("Outdated — generated for abcdef1")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
      },
    },
    {
      name: "no changed files",
      props: { data: makeData({ changed_files: 0 }) },
      expectBody: () => {
        expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
        expect(screen.getByText("This PR has no changed files — nothing to brief")).toBeInTheDocument();
      },
    },
    {
      name: "ready",
      props: { data: makeData({ brief: BRIEF }) },
      expectBody: () => {
        expect(screen.getByText("Adds <b>x</b> to config")).toBeInTheDocument();
      },
    },
  ];

  it.each(BANNER_CASES)("keeps the verdict banner when the brief is in the $name state", ({ props, expectBody }) => {
    renderCard({ ...props, verdict: READY });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("6 findings · 2 blockers")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expectBody();
  });

  it("places the provenance info button in the banner title row next to the verdict label", () => {
    renderCard({ data: makeData({ brief: BRIEF }), verdict: READY });
    const label = screen.getByText("Request changes");
    const button = screen.getByRole("button", { name: /Security Reviewer's review run of/ });
    expect(label.parentElement).not.toBeNull();
    expect(label.parentElement).toContainElement(button);
  });

  it("renders an uppercase PR Brief heading before the banner", () => {
    renderCard({ data: makeData({ brief: BRIEF }), verdict: READY });
    const heading = screen.getByRole("heading", { name: "PR Brief" });
    expect(within(heading).getByText("PR Brief")).toHaveStyle({ textTransform: "uppercase" });
    const label = screen.getByText("Request changes");
    expect(heading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the meta line at 12px in the muted text color", () => {
    renderCard({ data: makeData({ brief: BRIEF }) });
    const meta = screen.getByText(/1,234 → 210 tok/);
    expect(meta).toHaveStyle({ fontSize: "12px", color: "var(--text-muted)" });
  });
});
