import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-09-17T18:44:34.000Z",
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

describe("PRRow — cost column (Run Cost Badge)", () => {
  it("shows the formatted cost of the latest review's run", () => {
    renderRow(pr({ score: 61, cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash — never $0.00 — for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    // the score cell also renders "—" when unreviewed, so both dashes are expected
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows a dash for a reviewed PR whose run has no cost data (unpriced model)", () => {
    renderRow(pr({ score: 61, cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
