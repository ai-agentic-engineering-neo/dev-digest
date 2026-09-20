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

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 200,
    deletions: 40,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-13T18:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("renders a formatted cost for a reviewed PR", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders '—' for a PR with no cost yet (never reviewed)", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
