import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows no badge at all when the PR has never had any run", () => {
    renderRow(pr({ cost_usd: undefined }));
    expect(screen.getByTestId("cost-cell")).toBeEmptyDOMElement();
  });

  it("shows — for a reviewed PR whose last run has no cost data", () => {
    renderRow(pr({ score: 61, updated_at: "2026-06-01T00:00:00.000Z", cost_usd: null }));
    expect(screen.getByTestId("cost-cell")).toHaveTextContent("—");
  });

  it("shows a real cost, floor of 3 decimals, no padding", () => {
    renderRow(pr({ score: 88, cost_usd: 0.0013 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });
});
