import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

const PR: PrMeta = {
  id: "pr-1",
  number: 482,
  title: "Add rate limiting",
  author: "marisa.koch",
  branch: "feat/x",
  base: "main",
  head_sha: "abc",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: null,
  updated_at: null,
  score: 61,
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the PR's aggregated review cost", () => {
    renderRow({ ...PR, cost_usd: 0.014 });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' when the PR has no cost data (never reviewed / old runs)", () => {
    renderRow({ ...PR, score: null, cost_usd: null });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // score cell and cost cell both render a dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
