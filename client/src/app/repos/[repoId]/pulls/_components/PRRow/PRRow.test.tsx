/** PRRow — the COST column must show "—" for an unpriced/never-reviewed PR
 *  and a formatted dollar figure once the latest completed run has a cost. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
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
    head_sha: "abc123",
    additions: 200,
    deletions: 30,
    files_count: 5,
    status: "needs_review",
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow", () => {
  it("shows an em dash when the PR has no completed run yet", () => {
    // score set so the only "—" on the row is the cost cell's, not the score ring's.
    renderRow(pr({ score: 80, cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the formatted cost of the latest completed run", () => {
    renderRow(pr({ score: 80, cost_usd: 0.014 }));
    expect(screen.getByText("$0.01")).toBeInTheDocument();
  });
});
