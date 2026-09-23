/**
 * PRRow — the COST column shows the latest review's run cost
 * (server/specs/01-run-cost-badge.md); an unreviewed PR reads "—", never "$0.00".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-09-23T09:00:00.000Z",
    updated_at: "2026-09-23T09:00:00.000Z",
    score: null,
    cost_usd: null,
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

describe("PRRow — COST column", () => {
  it("a reviewed PR shows its latest review's cost", () => {
    renderRow(pr({ status: "reviewed", score: 61, cost_usd: 0.0141 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("an unreviewed PR reads '—' for both score and cost, never '$0.00'", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
