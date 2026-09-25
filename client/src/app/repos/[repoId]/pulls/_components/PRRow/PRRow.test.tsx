/**
 * PRRow — the COST column (L01 run cost badge): a PR whose completed runs have a
 * known cost shows the compact "$x" with a runs tooltip; a PR with no priced
 * run shows "—", never "$0.00".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-09-25T09:00:00.000Z",
    updated_at: "2026-09-25T09:00:00.000Z",
    score: 61,
    cost_usd: null,
    cost_runs: null,
    findings_critical: null,
    findings_warning: null,
    findings_suggestion: null,
    latest_findings: null,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("shows the compact cost with a runs tooltip", () => {
    renderRow(pr({ cost_usd: 0.012, cost_runs: 3 }));
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge).toHaveTextContent("$0.012");
    expect(badge).toHaveAttribute("title", "3 runs");
  });

  it("shows an em dash when no completed run has a known cost", () => {
    renderRow(pr({ cost_usd: null, cost_runs: null }));
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent("—");
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a single free run reads $0.00 with a singular tooltip", () => {
    renderRow(pr({ cost_usd: 0, cost_runs: 1 }));
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge).toHaveTextContent("$0.00");
    expect(badge).toHaveAttribute("title", "1 run");
  });
});

describe("PRRow — FINDINGS column + popover", () => {
  const previews = [
    {
      id: "f1",
      severity: "CRITICAL" as const,
      category: "security" as const,
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      confidence: 0.98,
      excerpt: "Line 12 contains a literal sk_live_ Stripe secret key.",
    },
    {
      id: "f2",
      severity: "WARNING" as const,
      category: "perf" as const,
      title: "N+1 query in user list endpoint",
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      confidence: 0.86,
      excerpt: "Loop issues one query per user.",
    },
  ];

  it("shows per-severity counts and opens a read-only popover on hover", () => {
    renderRow(pr({ findings_critical: 1, findings_warning: 1, findings_suggestion: 0, latest_findings: previews }));
    const cell = screen.getByTestId("findings-cell");
    expect(within(cell).getByTitle("Critical")).toHaveTextContent("1");
    expect(within(cell).getByTitle("Warning")).toHaveTextContent("1");
    expect(within(cell).queryByTitle("Suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();

    fireEvent.mouseEnter(cell);
    const pop = screen.getByTestId("findings-popover");
    expect(pop).toHaveTextContent("2 FINDINGS IN THIS RUN");
    expect(within(pop).getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(within(pop).getByText("src/config.ts:12")).toBeInTheDocument();
    expect(within(pop).getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(within(pop).getByText("98% confidence")).toBeInTheDocument();
    expect(within(pop).getByText("Loop issues one query per user.")).toBeInTheDocument();
    // read-only: no action buttons inside the popover
    expect(within(pop).queryByRole("button")).not.toBeInTheDocument();

    fireEvent.mouseLeave(cell);
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
  });

  it("a never-reviewed PR shows an em dash and no popover on hover", () => {
    renderRow(pr({ score: null }));
    const cell = screen.getByTestId("findings-cell");
    expect(cell).toHaveTextContent("—");
    fireEvent.mouseEnter(cell);
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
  });
});
