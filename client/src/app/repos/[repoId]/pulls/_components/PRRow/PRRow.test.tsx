import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
import { COLUMN_KEYS, GRID } from "../../constants";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

let mockReviews: ReviewRecord[] | undefined = undefined;
// PRRow now also renders RunReviewDropdown (the Actions column), which pulls
// `useRunReview` out of this SAME module and `useAgents` out of another —
// without both mocks every test in this file throws on an undefined hook.
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: mockReviews }),
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  mockReviews = undefined;
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows no badge at all when the PR has never had any run", () => {
    renderRow(pr({ cost_usd: undefined }));
    expect(screen.getByTestId("cost-cell")).toBeEmptyDOMElement();
  });

  it("shows — for a reviewed PR whose last run has no cost data", () => {
    renderRow(pr({ score: 61, updated_at: "2026-06-01T00:00:00.000Z", cost_usd: null }));
    expect(screen.getByTestId("cost-cell")).toHaveTextContent("—");
  });

  it("shows a real cost, floor of 3 decimals, no padding", () => {
    renderRow(pr({ score: 88, cost_usd: 0.0013 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows no badge/cell content at all when the PR has no review yet", () => {
    renderRow(pr({ findings_by_severity: undefined }));
    expect(screen.getByTestId("findings-cell")).toBeEmptyDOMElement();
  });

  it("shows the severity counts from pr.findings_by_severity", () => {
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }));
    const cell = screen.getByTestId("findings-cell");
    expect(cell).not.toBeEmptyDOMElement();
    expect(cell.querySelectorAll("button")).toHaveLength(2); // CRITICAL + WARNING only
  });

  it("clicking a severity chip deep-links to that severity, NOT to the bare PR route", () => {
    // stopPropagation still holds: the row's own push("/repos/r1/pulls/482")
    // must not fire — the single push is the chip's own deep link.
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    fireEvent.click(screen.getByTestId("findings-cell").querySelector("button")!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482?tab=findings&severity=CRITICAL");
    // Navigate-only: the popover is not pinned open behind the transition.
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
  });

  it("includes &agent= when a run_id is already in the lazily-fetched review", () => {
    mockReviews = [
      {
        id: "rv-review",
        pr_id: "pr-1",
        agent_id: null,
        run_id: "run-7",
        agent_name: "Sec",
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 61,
        model: null,
        created_at: "2026-01-01T00:00:00Z",
        findings: [],
      },
    ];
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 } }));
    fireEvent.click(screen.getByTestId("findings-cell").querySelector("button")!);
    expect(push).toHaveBeenCalledWith(
      "/repos/r1/pulls/482?tab=findings&severity=WARNING&agent=run-7",
    );
  });

  it("clicking the findings cell outside the badge still navigates the row", () => {
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    fireEvent.click(screen.getByTestId("findings-cell"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482");
  });

  it("popover contents pick the review-kind row, not reviews[0], when a newer summary review exists", () => {
    mockReviews = [
      {
        id: "rv-summary",
        pr_id: "pr1",
        agent_id: null,
        run_id: "run2",
        agent_name: null,
        kind: "summary",
        verdict: null,
        summary: null,
        score: null,
        model: null,
        created_at: "2026-02-01T00:00:00Z",
        findings: [],
      },
      {
        id: "rv-review",
        pr_id: "pr1",
        agent_id: null,
        run_id: "run1",
        agent_name: "Sec",
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 61,
        model: null,
        created_at: "2026-01-01T00:00:00Z",
        findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "Real finding",
            file: "a.ts",
            start_line: 1,
            end_line: 1,
            rationale: "r",
            confidence: 0.9,
            review_id: "rv-review",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      },
    ];
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    const cell = screen.getByTestId("findings-cell");
    fireEvent.mouseEnter(cell.querySelector("button")!.parentElement!);
    expect(screen.getByText("Real finding")).toBeInTheDocument();
  });

  it("the popover lists ACTIVE findings only, so its count matches the badge's own", () => {
    // pr.findings_by_severity is server-computed active-only (1 CRITICAL). The
    // review carries a dismissed CRITICAL too — an unfiltered popover would
    // read "2 FINDINGS IN THIS RUN" beside a badge claiming 1.
    mockReviews = [
      {
        id: "rv-review",
        pr_id: "pr-1",
        agent_id: null,
        run_id: "run-1",
        agent_name: "Sec",
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 61,
        model: null,
        created_at: "2026-01-01T00:00:00Z",
        findings: [
          {
            id: "f-active",
            severity: "CRITICAL",
            category: "security",
            title: "Active finding",
            file: "a.ts",
            start_line: 1,
            end_line: 1,
            rationale: "r",
            confidence: 0.9,
            review_id: "rv-review",
            accepted_at: null,
            dismissed_at: null,
          },
          {
            id: "f-dismissed",
            severity: "CRITICAL",
            category: "security",
            title: "Dismissed finding",
            file: "b.ts",
            start_line: 2,
            end_line: 2,
            rationale: "r",
            confidence: 0.9,
            review_id: "rv-review",
            accepted_at: null,
            dismissed_at: "2026-02-01T00:00:00Z",
          },
        ],
      } as ReviewRecord,
    ];
    renderRow(pr({ score: 61, findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    const cell = screen.getByTestId("findings-cell");
    fireEvent.mouseEnter(cell.querySelector("button")!.parentElement!);
    expect(screen.getByText("Active finding")).toBeInTheDocument();
    expect(screen.queryByText("Dismissed finding")).not.toBeInTheDocument();
    expect(screen.getByText(/1 FINDINGS IN THIS RUN/)).toBeInTheDocument();
  });
});

describe("PRRow — Actions column", () => {
  it("renders a labelled 'Run Review' ghost trigger that highlights on hover", () => {
    renderRow(pr({}));
    const cell = screen.getByTestId("actions-cell");
    const trigger = screen.getByRole("button", { name: "Run Review" });
    expect(cell).toContainElement(trigger);
    expect(trigger).toHaveTextContent("Run Review");
    // Quiet at rest (muted text, transparent)…
    expect(trigger).toHaveStyle({ color: "var(--text-secondary)", background: "transparent" });
    // …brightens on hover.
    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveStyle({ color: "var(--text-primary)", background: "var(--bg-hover)" });
    fireEvent.mouseLeave(trigger);
    expect(trigger).toHaveStyle({ color: "var(--text-secondary)" });
  });

  it("clicking the trigger opens the menu and does NOT navigate the row", () => {
    renderRow(pr({}));
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
  });

  it("renders the menu into document.body (the table card is overflow: hidden)", () => {
    renderRow(pr({}));
    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    const menu = document.body.querySelector("[data-testid='dropdown-menu']")!;
    expect(menu).toBeInTheDocument();
    expect(screen.getByTestId("actions-cell").contains(menu)).toBe(false);
  });

  it("renders nothing when the PR row carries no id (nothing to run)", () => {
    renderRow(pr({ id: null }));
    expect(screen.getByTestId("actions-cell")).toBeEmptyDOMElement();
  });
});

describe("PRRow — physical cell order matches COLUMN_KEYS", () => {
  it("lays cells out as pullRequest | author | size | score | findings | status | cost | actions | updated", () => {
    const { container } = renderRow(
      pr({
        score: 61,
        cost_usd: 0.0013,
        updated_at: "2026-06-01T00:00:00.000Z",
        findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      }),
    );
    const cells = [...(container.firstChild as HTMLElement).children];
    expect(cells).toHaveLength(COLUMN_KEYS.length);
    expect(cells[4]).toBe(screen.getByTestId("findings-cell"));
    expect(cells[6]).toBe(screen.getByTestId("cost-cell"));
    expect(cells[7]).toBe(screen.getByTestId("actions-cell"));
    // Status sits between findings and cost; updated is still the tail.
    expect(cells[5]).toHaveTextContent("Needs review");
    expect(cells[8]).toHaveTextContent(/\d+[mhd]|now|—/);
  });

  it("the GRID track count matches COLUMN_KEYS (a partial reorder would desync them)", () => {
    expect(GRID.trim().split(/\s+/)).toHaveLength(COLUMN_KEYS.length);
  });
});
