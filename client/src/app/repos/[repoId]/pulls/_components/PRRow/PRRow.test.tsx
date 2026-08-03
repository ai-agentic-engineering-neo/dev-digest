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

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
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
    opened_at: "2026-06-11T18:00:00.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 61,
    cost_usd: 0.014,
    ...o,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PRRow — COST column", () => {
  it("shows the summed cost across the PR's runs", () => {
    renderWithIntl(<PRRow pr={pr({ cost_usd: 0.014 })} repoId="repo-1" />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows the em dash for a PR with no runs (no score, no cost)", () => {
    renderWithIntl(<PRRow pr={pr({ cost_usd: null, score: null })} repoId="repo-1" />);
    // The score cell AND the cost cell both fall back to the em dash when unset.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
