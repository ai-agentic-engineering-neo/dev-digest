/**
 * PRRow — M1 cost badge: the COST cell shows the latest done-run spend and a
 * dash when it is unknown (never reviewed / legacy run without a stored cost).
 */
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
    id: "p1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.0137,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows the latest run cost", () => {
    renderRow(pr({}));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash when the cost is unknown", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    // score ring, cost and updated all fall back to "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
