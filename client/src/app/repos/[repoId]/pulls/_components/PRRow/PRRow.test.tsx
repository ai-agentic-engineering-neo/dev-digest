/** PRRow — COST column (spec: docs/features/run-cost/spec.md, S1). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "e694ac8",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-11-20T09:00:00.000Z",
    score: 61,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows the PR cost compactly", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' when the PR has no cost data", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    // score cell and cost cell both render "—" for an unreviewed PR
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
