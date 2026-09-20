/**
 * PRRow — the Cost cell. Cost is the price of the PR's LATEST run, so it is
 * absent exactly as often as the score ring is: a PR nobody has reviewed, and a
 * run on a model with no known pricing, both read as an em dash rather than $0.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add Stripe webhook handler",
    author: "marisa.koch",
    branch: "feat/stripe",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 40,
    deletions: 2,
    files_count: 3,
    status: "reviewed",
    opened_at: "2026-06-10T10:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 87,
    cost_usd: null,
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
  it("shows what the latest run cost, in cents-visible precision", () => {
    renderRow(pr({ cost_usd: 0.0412 }));
    expect(screen.getByText("$0.0412")).toBeInTheDocument();
  });

  it("drops to two decimals once a PR has cost more than a dollar", () => {
    renderRow(pr({ cost_usd: 1.2345 }));
    expect(screen.getByText("$1.23")).toBeInTheDocument();
  });

  it("shows an em dash for a PR with no priced run", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
    // Both the score ring and the cost cell render one.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
