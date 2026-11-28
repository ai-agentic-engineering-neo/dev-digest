/**
 * PRRow — run cost badge: the row shows the USD cost of the PR's latest review
 * run, and shows no badge at all when the PR has never been run.
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

describe("PRRow run cost badge", () => {
  it("shows the latest run cost in USD", () => {
    renderRow(pr({ last_run_cost_usd: 0.00421 }));
    const badge = screen.getByTestId("run-cost-badge");
    expect(badge.textContent).toBe("$0.0042");
    expect(badge.getAttribute("aria-label")).toBe("Latest review run cost $0.0042");
  });

  it("renders no badge when the PR has no runs", () => {
    renderRow(pr({ score: null, last_run_cost_usd: null }));
    expect(screen.queryByTestId("run-cost-badge")).toBeNull();
  });

  it("renders no badge when the field is absent (older API)", () => {
    renderRow(pr({}));
    expect(screen.queryByTestId("run-cost-badge")).toBeNull();
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
