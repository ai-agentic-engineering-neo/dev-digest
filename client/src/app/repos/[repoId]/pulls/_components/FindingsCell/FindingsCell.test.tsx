import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { FindingRecord, PrMeta, ReviewRecord } from "@devdigest/shared";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const { usePrReviewsMock } = vi.hoisted(() => ({ usePrReviewsMock: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: usePrReviewsMock,
}));

import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

function finding(severity: FindingRecord["severity"], id: string, title: string): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r-latest",
    accepted_at: null,
    dismissed_at: null,
  };
}

function review(id: string, createdAt: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    kind: "review",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    model: "test",
    agent_name: "Agent",
    verdict: "comment",
    summary: "s",
    score: 70,
    created_at: createdAt,
    findings,
  };
}

function pr(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/x",
    base: "main",
    head_sha: "abc123",
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.01,
    findings_by_severity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
    ...overrides,
  };
}

const OLD_REVIEW = review("r-old", "2026-01-01T00:00:00Z", [finding("CRITICAL", "old1", "Old finding")]);
const LATEST_REVIEW = review("r-latest", "2026-02-01T00:00:00Z", [
  finding("CRITICAL", "f1", "Hardcoded Stripe secret key"),
  finding("WARNING", "f2", "N+1 query in user list endpoint"),
]);

beforeEach(() => {
  pushMock.mockClear();
  usePrReviewsMock.mockReset();
  usePrReviewsMock.mockReturnValue({ data: [OLD_REVIEW, LATEST_REVIEW] });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FindingsCell", () => {
  it("renders a badge only for non-zero severities", () => {
    render(<FindingsCell pr={pr()} repoId="repo1" repoFullName="acme/payments-api" />);
    // CRITICAL:1 and SUGGESTION:0 configured above (WARNING:1 too) → 2 badges, not 3.
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no findings on the latest review", () => {
    const { container } = render(
      <FindingsCell
        pr={pr({ findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } })}
        repoId="repo1"
        repoFullName="acme/payments-api"
      />,
    );
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders nothing when findings_by_severity is absent (never reviewed)", () => {
    const { container } = render(
      <FindingsCell pr={pr({ findings_by_severity: null })} repoId="repo1" repoFullName="acme/payments-api" />,
    );
    expect(container.querySelector("span")).toBeNull();
  });

  it("hovering opens a popover with the latest review's findings only", async () => {
    render(<FindingsCell pr={pr()} repoId="repo1" repoFullName="acme/payments-api" />);
    const cell = screen.getAllByText("1")[0]!.closest("div")!;
    fireEvent.mouseEnter(cell);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(usePrReviewsMock).toHaveBeenCalledWith("pr1", { enabled: true });
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    // Findings from the OLDER review must not appear — only the latest counts.
    expect(screen.queryByText("Old finding")).not.toBeInTheDocument();
  });

  it("clicking the cell navigates to the Findings tab and doesn't bubble to a parent handler", () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <FindingsCell pr={pr()} repoId="repo1" repoFullName="acme/payments-api" />
      </div>,
    );
    const badge = screen.getAllByText("1")[0]!;
    fireEvent.click(badge);
    expect(pushMock).toHaveBeenCalledWith("/repos/repo1/pulls/482?tab=findings");
    expect(parentClick).not.toHaveBeenCalled();
  });
});
