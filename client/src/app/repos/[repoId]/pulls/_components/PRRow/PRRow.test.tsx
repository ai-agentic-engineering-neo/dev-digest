import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

describe("PRRow — findings cell", () => {
  const F = (id: string, severity: "CRITICAL" | "WARNING" | "SUGGESTION", title: string) => ({
    id, severity, category: "perf" as const, title, file: "src/a.ts", start_line: 4, end_line: 4,
    confidence: 0.86, rationale: "Because reasons.",
  });
  const findings = [F("1", "CRITICAL", "Boom"), F("2", "WARNING", "Hmm"), F("3", "WARNING", "Hmm 2")];

  it("shows severity icons with counts and a hover popover with the PR's findings", () => {
    renderRow({ ...PR, findings });
    expect(screen.getByLabelText("1 CRITICAL")).toBeInTheDocument();
    expect(screen.getByLabelText("2 WARNING")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByLabelText("1 CRITICAL").parentElement!.parentElement!);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("3 findings in this run");
    expect(tip).toHaveTextContent("Boom");
    expect(tip).toHaveTextContent("src/a.ts:4");
  });

  it("shows '—' when the PR has no findings", () => {
    renderRow({ ...PR, score: null, cost_usd: null, findings: [] });
    expect(screen.queryByLabelText(/CRITICAL|WARNING|SUGGESTION/)).not.toBeInTheDocument();
  });
});
