/**
 * PRRow — COST column: the row shows the USD cost of the PR's latest completed
 * review run in its own cell, and a dash (never $0.00) when there is none.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
import { formatUsd } from "@/lib/format-usd";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 42,
    title: "Add run cost badge",
    author: "octocat",
    branch: "feat/cost",
    base: "main",
    head_sha: "abc123",
    additions: 10,
    deletions: 2,
    files_count: 2,
    status: "reviewed",
    opened_at: null,
    updated_at: null,
    score: 88,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow COST column", () => {
  it("shows the latest run cost in its own column", () => {
    renderRow(pr({ last_run_cost_usd: 0.00421 }));
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge.textContent).toBe("$0.0042");
    expect(badge.getAttribute("aria-label")).toBe("Latest review run cost $0.0042");
    // its own grid cell, not inline next to the PR number
    expect(screen.getByText("#42").contains(badge)).toBe(false);
    expect(screen.getByText("#42").parentElement!.contains(badge)).toBe(false);
  });

  it("shows a dash, not $0.00, when the PR has no completed runs", () => {
    renderRow(pr({ score: null, last_run_cost_usd: null }));
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("—");
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("shows a dash when the field is absent (older API)", () => {
    renderRow(pr({}));
    expect(screen.getByTestId("run-cost-badge").textContent).toBe("—");
  });
});

describe("formatUsd", () => {
  it("keeps precision for sub-cent costs", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.00004)).toBe("<$0.0001");
    expect(formatUsd(0.0123)).toBe("$0.012");
    expect(formatUsd(2.5)).toBe("$2.50");
  });
});
