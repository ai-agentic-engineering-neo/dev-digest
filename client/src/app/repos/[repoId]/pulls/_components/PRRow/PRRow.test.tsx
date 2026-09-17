/**
 * PRRow — the Cost cell. A reviewed PR shows the summed cost of its latest
 * review round (3 decimals under $1); a never-reviewed PR shows an em-dash,
 * never a fake $0.00.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta, FindingPreview } from "@/lib/types";
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
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-10T09:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    findings: [],
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

describe("PRRow — cost cell", () => {
  it("shows the latest-round cost with 3 decimals under $1", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows 2 decimals at $1 and above", () => {
    renderRow(pr({ cost_usd: 1.256 }));
    expect(screen.getByText("$1.26")).toBeInTheDocument();
  });

  it("keeps sub-cent costs visible instead of rounding to $0.000", () => {
    renderRow(pr({ cost_usd: 0.0000379 }));
    expect(screen.getByText("$0.000038")).toBeInTheDocument();
  });

  it("shows an em-dash when the PR has no priced round (never reviewed / unpriced)", () => {
    // Give the row findings so the FINDINGS cell shows pills — otherwise its
    // own em-dash collides with the cost cell's (see client/INSIGHTS.md).
    renderRow(pr({ cost_usd: null, findings: [PREVIEW] }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });
});

const PREVIEW: FindingPreview = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key in commit",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  confidence: 0.98,
  rationale: "Line 12 contains a literal sk_live_ key.",
};

describe("PRRow — findings cell", () => {
  it("renders the FINDINGS cell with the row's previews", () => {
    renderRow(pr({ findings: [PREVIEW] }));
    expect(screen.getByLabelText("1 findings")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders an em-dash when the PR has no findings", () => {
    // Score is set, so the only other em-dash candidate (score) is absent —
    // scope-safe with a single "—" in the row.
    renderRow(pr({ findings: [] }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
