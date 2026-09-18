/**
 * FindingsCell — the PR list's FINDINGS column.
 *
 * Two behaviours matter beyond rendering: the reviews request must NOT fire
 * until a popover is opened (otherwise every row on the list fetches), and a
 * click must not reach the PR row's navigate handler.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRecord, SeverityCounts } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

const counts = (o: Partial<SeverityCounts> = {}): SeverityCounts => ({
  CRITICAL: 0,
  WARNING: 0,
  SUGGESTION: 0,
  ...o,
});

const REVIEW: ReviewRecord = {
  id: "rv1",
  pr_id: "pr1",
  agent_id: "ag1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Two problems.",
  score: 61,
  model: "deepseek/deepseek-v4-flash",
  grounding: "2/2 passed",
  created_at: "2026-06-11T18:44:34.000Z",
  findings: [
    {
      id: "f1",
      review_id: "rv1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "Line 12 contains a literal string starting with sk_live_.",
      suggestion: null,
      confidence: 0.98,
      kind: "secret_leak",
      trifecta_components: null,
      evidence: null,
      accepted_at: null,
      dismissed_at: null,
    },
    {
      id: "f2",
      review_id: "rv1",
      severity: "WARNING",
      category: "perf",
      title: "N+1 query in user list endpoint",
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      rationale: "The loop calls db.posts.findMany once per user.",
      suggestion: null,
      confidence: 0.86,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([REVIEW]),
    } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

function renderCell(ui: React.ReactElement, onRowClick?: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRowClick}>{ui}</div>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("shows a count per non-zero severity and omits the empty ones", () => {
    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 2, SUGGESTION: 4 })} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    // Only two badges — the zero WARNING bucket renders nothing.
    expect(screen.getByRole("button").textContent).toBe("24");
  });

  it("renders the em dash for a never-reviewed PR", () => {
    renderCell(<FindingsCell prId="pr1" counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the em dash for a reviewed PR with nothing outstanding", () => {
    renderCell(<FindingsCell prId="pr1" counts={counts()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not fetch reviews until the popover is opened", async () => {
    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 2 })} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toContain("/pulls/pr1/reviews");
  });

  it("lists the latest review's findings under a total heading", async () => {
    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 1, WARNING: 1 })} />);
    fireEvent.click(screen.getByRole("button", { name: /Show 2 findings/ }));

    expect(await screen.findByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
  });

  it("lists findings from every agent's latest review, not just the newest", async () => {
    // Regression: a multi-agent review writes one row per agent, and the
    // NEWEST one here found nothing. Listing only reviews[0] made the panel
    // read "5 findings" above "No findings."
    const emptyNewest: ReviewRecord = {
      ...REVIEW,
      id: "rv0",
      agent_id: "ag0",
      run_id: "run0",
      agent_name: "Performance Reviewer",
      score: 100,
      created_at: "2026-06-11T18:44:40.000Z",
      findings: [],
    };
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([emptyNewest, REVIEW]),
      } as Response),
    );

    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 1, WARNING: 1 })} />);
    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();
  });

  it("keeps the heading count equal to what it actually lists", async () => {
    // The badge counts come from the server; the heading must describe the
    // rendered rows, so the two can never contradict each other in the panel.
    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 9, WARNING: 9 })} />);
    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("2 findings")).toBeInTheDocument();
    expect(screen.queryByText("18 findings")).not.toBeInTheDocument();
  });

  it("never triggers the PR row's navigate handler", async () => {
    const onRowClick = vi.fn();
    renderCell(<FindingsCell prId="pr1" counts={counts({ CRITICAL: 1 })} />, onRowClick);

    fireEvent.click(screen.getByRole("button"));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText("Hardcoded Stripe secret key in commit"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
