/**
 * PRRow — the list is a CSS grid, not a table: the row's cells are POSITIONAL
 * and the column count lives in two other files (`GRID`, `COLUMN_KEYS`). A cell
 * added without its grid track silently shifts every column after it, which no
 * type check catches — so the guard here is "cells === columns", plus the cost
 * and findings cells' own unknown/known rendering.
 *
 * The findings popover is hover-driven and therefore not reachable by the e2e
 * runner (its command vocabulary has no hover verb) — its coverage lives here.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta, PrFindingsRollup } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { COLUMN_KEYS, GRID } from "../../constants";
import { PRRow } from "./PRRow";

// Hoisted so the same spy instance survives every useRouter() call and the
// "does this click navigate?" assertions can actually read it.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

function finding(o: Partial<PrFindingsRollup["preview"][number]> = {}) {
  return {
    id: "f-1",
    severity: "CRITICAL" as const,
    category: "security" as const,
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    confidence: 0.95,
    description: "A live secret is committed in plain text.",
    ...o,
  };
}

/** Two criticals + one warning across the run, one preview withheld by the cap. */
function rollup(o: Partial<PrFindingsRollup> = {}): PrFindingsRollup {
  return {
    total: 3,
    by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
    preview: [
      finding(),
      finding({
        id: "f-2",
        severity: "WARNING",
        category: "perf",
        title: "N+1 query in user list endpoint",
        file: "src/api/users.ts",
        start_line: 45,
        end_line: 52,
        confidence: 0.86,
        description: "The loop calls findMany once per user.",
      }),
    ],
    ...o,
  };
}

function pr(o: Partial<PrMeta> = {}): PrMeta {
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
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 61,
    cost_usd: 0.014,
    latest_findings: rollup(),
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("renders the PR's lifetime run cost", () => {
    // Adaptive precision: a cent or more prints 2 decimals, so 0.014 → "$0.01".
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });

  it("keeps full precision on a sub-cent total", () => {
    renderRow(pr({ cost_usd: 0.0021 }));
    expect(screen.getByText("$0.0021")).toBeInTheDocument();
  });

  it("renders an em dash when no run on the PR has a known cost", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("keeps one cell per declared column, so the positional grid stays aligned", () => {
    const { container } = renderRow(pr());
    const row = container.firstElementChild as HTMLElement;
    expect(row.children).toHaveLength(COLUMN_KEYS.length);
    expect(GRID.trim().split(/\s+/)).toHaveLength(COLUMN_KEYS.length);
  });
});

describe("PRRow — score column", () => {
  it("shows the score ring with no marker when every agent of the last run finished", () => {
    renderRow(pr({ score: 61, score_partial: false }));
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.queryByText(messages.list.scorePartial)).not.toBeInTheDocument();
  });

  it("marks the score as a partial run, with the reason on hover, when an agent failed", () => {
    renderRow(pr({ score: 88, score_partial: true }));
    expect(screen.getByText("88")).toBeInTheDocument();
    const marker = screen.getByText(messages.list.scorePartial);
    expect(marker).toHaveAttribute("title", messages.list.scorePartialHint);
  });

  it("shows neither ring nor marker for a PR that was never reviewed", () => {
    // Findings and cost stay populated so the score cell is the only "—".
    renderRow(pr({ score: null, score_partial: false }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(messages.list.scorePartial)).not.toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows one badge per severity actually present in the latest run", () => {
    renderRow(pr());
    const trigger = screen.getByRole("button", { name: /3 findings in the latest run/i });
    // Counts, not names: `compact` badges render the icon plus the number.
    expect(trigger).toHaveTextContent("2");
    expect(trigger).toHaveTextContent("1");
    // SUGGESTION is 0 here, so it must not get a badge at all.
    expect(trigger.children).toHaveLength(2);
  });

  it("counts every agent of the run, and lists them all in one popover", () => {
    vi.useFakeTimers();
    try {
      // The shape the server now sends for a 3-agent run: agent A found one
      // CRITICAL, agent B a CRITICAL and two WARNINGs, agent C nothing. The
      // cell must read 2 + 2, not whichever single agent finished last.
      renderRow(
        pr({
          latest_findings: {
            total: 4,
            by_severity: { CRITICAL: 2, WARNING: 2, SUGGESTION: 0 },
            preview: [
              finding({ id: "a-1" }),
              // Agent B reported the SAME issue as agent A. It is listed twice
              // on purpose — collapsing it would leave the counter above
              // saying 2 with one row beneath it.
              finding({ id: "b-1" }),
              finding({
                id: "b-2",
                severity: "WARNING",
                category: "perf",
                title: "N+1 query in user list endpoint",
                file: "src/api/users.ts",
                start_line: 45,
                end_line: 52,
              }),
              finding({
                id: "b-3",
                severity: "WARNING",
                category: "perf",
                title: "Unbounded Redis round-trip",
                file: "src/cache.ts",
                start_line: 8,
                end_line: 8,
              }),
            ],
          },
        }),
      );

      const trigger = screen.getByRole("button", { name: /4 findings in the latest run/i });
      // Two badges, carrying the summed counts — not four badges, one per agent.
      expect(trigger.children).toHaveLength(2);
      expect(trigger).toHaveTextContent("2");

      fireEvent.mouseEnter(trigger);
      expect(screen.getByText("4 FINDINGS IN THIS RUN")).toBeInTheDocument();
      // Every finding of the run is listed, the duplicate included, and nothing
      // is withheld — preview.length === total, so no "+N more" footer.
      expect(screen.getAllByText("Hardcoded Stripe secret key")).toHaveLength(2);
      expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
      expect(screen.getByText("Unbounded Redis round-trip")).toBeInTheDocument();
      expect(screen.queryByText(/more on the PR page/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders an em dash and no trigger when the PR has never been reviewed", () => {
    renderRow(pr({ latest_findings: null, cost_usd: 0.014 }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a plain 0 — not an em dash — when the latest review found nothing", () => {
    renderRow(
      pr({
        latest_findings: {
          total: 0,
          by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
          preview: [],
        },
      }),
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a read-only popover on hover, titled with the run's TOTAL finding count", () => {
    vi.useFakeTimers();
    try {
      renderRow(pr());
      expect(screen.queryByText("3 FINDINGS IN THIS RUN")).not.toBeInTheDocument();

      const trigger = screen.getByRole("button", { name: /3 findings in the latest run/i });
      fireEvent.mouseEnter(trigger);

      // Title uses `total` (3), even though the server capped `preview` at 2.
      expect(screen.getByText("3 FINDINGS IN THIS RUN")).toBeInTheDocument();
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
      expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
      expect(screen.getByText("95% conf")).toBeInTheDocument();
      expect(screen.getByText("+1 more on the PR page")).toBeInTheDocument();

      // Read-only: the previews offer no action — accept/dismiss live on the PR
      // page. The only button in the row is the popover trigger itself.
      expect(screen.getAllByRole("button")).toHaveLength(1);

      fireEvent.mouseLeave(trigger);
      // The close is on a timeout; act() flushes the state update it schedules.
      act(() => void vi.advanceTimersByTime(300));
      expect(screen.queryByText("3 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays open while the pointer travels from the trigger into the panel", () => {
    vi.useFakeTimers();
    try {
      renderRow(pr());
      const trigger = screen.getByRole("button", { name: /3 findings in the latest run/i });
      fireEvent.mouseEnter(trigger);
      const panel = screen.getByRole("tooltip");

      // Leaving the trigger starts a delayed close; entering the panel before it
      // fires must cancel it, or the popover is unusable with a mouse.
      fireEvent.mouseLeave(trigger);
      fireEvent.mouseEnter(panel);
      act(() => void vi.advanceTimersByTime(300));
      expect(screen.getByText("3 FINDINGS IN THIS RUN")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not navigate when the findings trigger is clicked, but the row still does", () => {
    renderRow(pr());
    fireEvent.click(screen.getByRole("button", { name: /3 findings in the latest run/i }));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482");
  });
});
