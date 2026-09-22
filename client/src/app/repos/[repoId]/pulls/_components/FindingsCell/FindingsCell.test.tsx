/**
 * FindingsCell — the PR list's FINDINGS column. The counters summarise; the
 * hover card lists every outstanding finding of the PR. Dismissed findings are
 * excluded on both sides, so the card header and the counters always agree.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { HOVER_OPEN_MS } from "../../constants";

const reviewsResult = vi.hoisted(() => ({
  current: { data: undefined as ReviewRecord[] | undefined, isLoading: false, isError: false },
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) =>
    prId ? reviewsResult.current : { data: undefined, isLoading: false, isError: false },
}));

import { FindingsCell } from "./FindingsCell";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "security-reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "…",
    score: 61,
    model: "openrouter/some-model",
    grounding: null,
    created_at: "2026-06-01T12:00:00.000Z",
    findings,
  } as ReviewRecord;
}

function renderCell(props: Partial<React.ComponentProps<typeof FindingsCell>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell
        counts={{ critical: 1, warning: 1, suggestion: 0 }}
        prId="pr-1"
        prNumber={482}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** Hover the cell and let the open delay elapse. */
function hoverCell() {
  fireEvent.mouseEnter(screen.getByRole("group", { name: "Findings" }));
  act(() => {
    vi.advanceTimersByTime(HOVER_OPEN_MS + 1);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reviewsResult.current = { data: undefined, isLoading: false, isError: false };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("FindingsCell — counters", () => {
  it("renders a counter per severity", () => {
    renderCell({ counts: { critical: 3, warning: 5, suggestion: 2 } });
    expect(screen.getByLabelText("Critical: 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Warning: 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Suggestion: 2")).toBeInTheDocument();
  });

  it("shows an em dash and no card for a PR that was never reviewed", () => {
    renderCell({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Findings" })).not.toBeInTheDocument();
  });
});

describe("FindingsCell — hover card", () => {
  it("opens on hover and lists the PR's findings", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          finding({
            id: "f2",
            severity: "WARNING",
            category: "perf",
            title: "N+1 query in user list endpoint",
            file: "src/api/users.ts",
            start_line: 45,
            end_line: 52,
          }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell();
    hoverCell();

    const card = screen.getByRole("dialog", { name: "Findings for this pull request" });
    expect(card).toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    // Multi-line findings render as a range.
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
  });

  it("leaves dismissed findings out, so the header matches the counters", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          finding({
            id: "f2",
            title: "Already handled",
            dismissed_at: "2026-06-02T10:00:00.000Z",
          }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 1, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("1 finding")).toBeInTheDocument();
    expect(screen.queryByText("Already handled")).not.toBeInTheDocument();
  });

  it("skips severities the counters can't count, so the two always agree", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          // `findings.severity` is an unconstrained text column; the server's
          // rollup ignores anything outside the three, so the card must too.
          finding({ id: "f2", severity: "WEIRD" as FindingRecord["severity"], title: "Odd one" }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 1, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("1 finding")).toBeInTheDocument();
    expect(screen.queryByText("Odd one")).not.toBeInTheDocument();
  });

  it("does not open when the PR is reviewed but has nothing outstanding", () => {
    renderCell({ counts: { critical: 0, warning: 0, suggestion: 0 } });
    hoverCell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus too", () => {
    reviewsResult.current = { data: [review([finding()])], isLoading: false, isError: false };
    renderCell();
    fireEvent.focus(screen.getByLabelText("Critical: 1"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    reviewsResult.current = { data: [review([finding()])], isLoading: false, isError: false };
    renderCell();
    hoverCell();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error line instead of an empty card when the fetch fails", () => {
    reviewsResult.current = { data: undefined, isLoading: false, isError: true };
    renderCell();
    hoverCell();
    expect(screen.getByText("Couldn’t load findings")).toBeInTheDocument();
  });
});
