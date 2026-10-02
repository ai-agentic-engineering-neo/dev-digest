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

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "5f01c7e",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: new Date().toISOString(),
    score: 61,
    findings: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 },
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the run cost at readable precision", () => {
    renderRow(pr());
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash rather than a fake $0.00 when there's no completed run", () => {
    renderRow(pr({ cost_usd: null, findings: { CRITICAL: 1 } }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows a badge per severity, in severity order", () => {
    const { container } = renderRow(pr({ findings: { SUGGESTION: 2, CRITICAL: 3, WARNING: 5 } }));
    // SeverityBadge renders its count in a .tnum span.
    const counts = [...container.querySelectorAll("span.tnum")].map((n) => n.textContent);
    expect(counts).toEqual(["3", "5", "2"]);
  });

  it("omits a severity with no findings", () => {
    const { container } = renderRow(pr({ findings: { CRITICAL: 1, WARNING: 0 } }));
    expect([...container.querySelectorAll("span.tnum")].map((n) => n.textContent)).toEqual(["1"]);
  });

  it("shows an em dash when the PR has never been reviewed", () => {
    const { container } = renderRow(pr({ findings: null, score: null, cost_usd: 0.014 }));
    expect(container.querySelectorAll("span.tnum")).toHaveLength(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
