/**
 * PRRow — the COST column (L01 run cost badge): a PR whose completed runs have a
 * known cost shows the compact "$x" with a runs tooltip; a PR with no priced
 * run shows "—", never "$0.00".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
