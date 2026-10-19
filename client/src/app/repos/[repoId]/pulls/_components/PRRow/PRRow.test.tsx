/** PRRow — the COST column shows the latest review's spend, "—" when unknown. */
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
    id: "p1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "abc",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
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

describe("PRRow cost column", () => {
  it("shows the latest review cost", () => {
    renderRow(pr({ cost_usd: 0.01412 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash (not $0.00) when the cost is unknown", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });
});
