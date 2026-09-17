/**
 * PRRow — the list's COST column reads the latest-batch cost the server
 * computed (`PrMeta.cost_usd`): a formatted price when known, an em dash when
 * unknown (never a fake $0.00).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
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
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "abc123",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "needs_review",
    opened_at: "2026-06-11T18:44:34.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("shows the formatted latest-batch cost when known", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash — never $0.00 — when cost is unknown", () => {
    // score:90 keeps the score cell out of the picture (it also renders "—"
    // when unreviewed) so the dash we find is unambiguously the cost cell's.
    renderRow(pr({ cost_usd: null, score: 90 }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
