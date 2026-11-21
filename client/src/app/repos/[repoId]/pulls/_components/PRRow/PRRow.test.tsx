/**
 * PRRow — one row of the PR list. M1: the COST cell shows the sum of the PR's
 * run costs, or a muted "—" when no run is priced (never "$0.00").
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta> = {}): PrMeta {
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
    updated_at: new Date().toISOString(),
    score: 61,
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

describe("PRRow — COST cell (M1)", () => {
  it("shows the PR's total run cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("Add rate limiting to public API endpoints")).toBeInTheDocument();
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.014");
  });

  it("shows a cheap total with 4 decimals so it doesn't look free", () => {
    renderRow(pr({ cost_usd: 0.0042 }));
    expect(screen.getByTestId("run-cost")).toHaveTextContent("$0.0042");
  });

  it("shows — when no run of the PR is priced", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByTestId("run-cost")).toHaveTextContent(/^—$/);
  });
});
