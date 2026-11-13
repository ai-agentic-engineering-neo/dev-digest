/**
 * PRRow — the COST cell. The list shows the latest priced run; a PR that has
 * never been reviewed (or was reviewed with a model the price book does not
 * know) shows an em dash, not a zero.
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

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 240,
    deletions: 45,
    files_count: 7,
    status: "needs_review",
    opened_at: "2026-06-10T10:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
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

describe("PRRow — cost cell", () => {
  it("shows the latest run's cost", () => {
    renderRow(pr());
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash for a PR with no priced run, never $0.00", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // both the score ring and the cost fall back to the same dash
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("an unreviewed PR (cost absent from the payload) still renders", () => {
    const { cost_usd: _omitted, ...rest } = pr({ score: null });
    renderRow(rest as PrMeta);
    expect(screen.getByText(/Add rate limiting/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
