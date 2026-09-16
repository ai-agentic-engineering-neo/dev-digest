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
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 100,
    deletions: 20,
    files_count: 3,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-06-13T20:52:51.000Z",
    score: 61,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows a known cost formatted as USD", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' (never '$0.00') when cost is unknown", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows '—' for a PR that has never been reviewed (cost_usd absent)", () => {
    renderRow(pr({ score: null, cost_usd: undefined }));
    // Both the score cell (unreviewed) and the cost cell (no data) render "—".
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
