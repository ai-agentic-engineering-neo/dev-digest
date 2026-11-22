/** PRRow — the Cost column (M1 run cost badge). */
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
    opened_at: null,
    updated_at: null,
    score: 61,
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

describe("PRRow — cost column", () => {
  it("shows the PR's total run cost", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.0140")).toBeInTheDocument();
  });

  it("shows a dash with a tooltip when no run has a known cost", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    const cell = screen.getByTitle("No run with a known cost yet");
    expect(cell).toHaveTextContent("—");
  });

  it("marks a total that includes estimated runs with ~ and a tooltip", () => {
    renderRow(pr({ cost_usd: 0.0021, cost_estimated: true }));
    const cell = screen.getByTitle("Approximate: includes runs estimated from tokens × list price");
    expect(cell).toHaveTextContent("~$0.0021");
  });
});
