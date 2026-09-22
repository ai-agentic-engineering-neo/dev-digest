/**
 * PRRow — the COST column: total spend on reviewing this PR. A PR nobody has
 * reviewed (or whose runs all failed) must read "—", never "$0.00".
 * Plus the FINDINGS column: severity counters that must not swallow the row's
 * own click (the counters are how you open the PR from that cell).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

// A stable spy: `useRouter: () => ({ push: vi.fn() })` would hand out a fresh
// mock on every call, making navigation impossible to assert.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);
beforeEach(() => push.mockClear());

function pr(o: Partial<PrMeta> = {}): PrMeta {
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
    opened_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    findings_counts: { critical: 2, warning: 2, suggestion: 2 },
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={meta} repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const findingsGroup = () => screen.getByRole("group", { name: "Findings" });

describe("PRRow — cost column", () => {
  it("shows the total cost of the PR's runs", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash when no run of the PR has cost data", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows one counter per severity", () => {
    renderRow(pr({ findings_counts: { critical: 3, warning: 5, suggestion: 2 } }));
    const group = findingsGroup();
    expect(within(group).getByLabelText("Critical: 3")).toBeInTheDocument();
    expect(within(group).getByLabelText("Warning: 5")).toBeInTheDocument();
    expect(within(group).getByLabelText("Suggestion: 2")).toBeInTheDocument();
  });

  it("shows an em dash for a PR that has never been reviewed", () => {
    renderRow(pr({ findings_counts: null, cost_usd: 0.014 }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Findings" })).not.toBeInTheDocument();
  });

  it("opens the PR when a counter is clicked — the click must reach the row", () => {
    renderRow(pr());
    fireEvent.click(within(findingsGroup()).getByLabelText("Critical: 2"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });

  it("keeps a zero counter clickable, so it is no dead zone in the row", () => {
    renderRow(pr({ findings_counts: { critical: 0, warning: 0, suggestion: 0 } }));
    const zero = within(findingsGroup()).getByLabelText("Suggestion: 0");
    expect(zero).not.toBeDisabled();
    fireEvent.click(zero);
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });
});
