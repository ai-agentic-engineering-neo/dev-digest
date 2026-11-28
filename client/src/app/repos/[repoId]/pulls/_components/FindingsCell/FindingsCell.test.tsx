import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrMeta, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** Stands in for `usePrReviews`: records the PR id it is asked for. */
const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  usePrReviews.mockReset();
  usePrReviews.mockImplementation((prId: string | null) => ({
    data: prId ? REVIEWS : undefined,
    isLoading: false,
    isError: false,
  }));
});

function finding(id: string, severity: FindingRecord["severity"], title: string): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(o: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr-1",
    agent_id: "security",
    run_id: null,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: "m",
    created_at: "2026-01-01T12:00:00.000Z",
    findings: [],
    ...o,
  };
}

/** Two agents: Security (1 CRITICAL, 1 WARNING) and Performance (1 WARNING, 2 SUGGESTION). */
const REVIEWS: ReviewRecord[] = [
  review({
    id: "sec",
    findings: [
      finding("s1", "CRITICAL", "Hardcoded Stripe secret key"),
      finding("s2", "WARNING", "N+1 query in user list"),
    ],
  }),
  review({
    id: "perf",
    agent_id: "performance",
    agent_name: "Performance Reviewer",
    created_at: "2026-01-01T11:00:00.000Z",
    findings: [
      finding("p1", "WARNING", "Unbounded retry loop"),
      finding("p2", "SUGGESTION", "Cache the limiter config"),
      finding("p3", "SUGGESTION", "Reuse the Redis connection"),
    ],
  }),
];

function pr(findings_counts: PrMeta["findings_counts"]): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "needs_review",
    findings_counts,
  };
}

function renderCell(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("shows a chip with the count for each severity that has findings", () => {
    renderCell(pr({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 }));
    expect(screen.getByTestId("findings-chip-CRITICAL")).toHaveTextContent("1");
    expect(screen.getByTestId("findings-chip-WARNING")).toHaveTextContent("2");
    expect(screen.queryByTestId("findings-chip-SUGGESTION")).not.toBeInTheDocument();
  });

  it("shows a dash and no preview for a PR without findings", () => {
    renderCell(pr(null));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByTestId("findings-cell")).not.toBeInTheDocument();
    cleanup();
    renderCell(pr({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("loads the reviews only on hover, then previews both agents' findings", () => {
    renderCell(pr({ CRITICAL: 1, WARNING: 2, SUGGESTION: 2 }));
    // Before hover the hook is disabled (null id) → no request.
    expect(usePrReviews).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");

    const preview = within(screen.getByRole("tooltip"));
    expect(preview.getByText("5 findings in this run")).toBeInTheDocument();
    expect(preview.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(preview.getByText("Reuse the Redis connection")).toBeInTheDocument();
    expect(preview.getAllByText(/Security Reviewer/)).toHaveLength(2);
    expect(preview.getAllByText(/Performance Reviewer/)).toHaveLength(3);

    fireEvent.mouseLeave(screen.getByTestId("findings-cell"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("lists at most six findings and summarises the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) => finding(`w${i}`, "WARNING", `Warning number ${i}`));
    usePrReviews.mockImplementation(() => ({
      data: [review({ id: "sec", findings: many })],
      isLoading: false,
      isError: false,
    }));
    renderCell(pr({ CRITICAL: 0, WARNING: 8, SUGGESTION: 0 }));
    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));
    const preview = within(screen.getByRole("tooltip"));
    expect(preview.getByText("8 findings in this run")).toBeInTheDocument();
    expect(preview.getAllByText(/Warning number/)).toHaveLength(6);
    expect(preview.getByText("+2 more")).toBeInTheDocument();
  });

  it("a click opens the PR's Agent runs tab without triggering the row", () => {
    const onRowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRowClick}>
          <FindingsCell pr={pr({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 })} repoId="repo-1" />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("findings-cell"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482?tab=findings");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
