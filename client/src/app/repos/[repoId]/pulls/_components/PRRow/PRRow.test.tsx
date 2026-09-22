import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { PrMeta } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    updated_at: "2026-06-01T00:00:00Z",
    score: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return renderWithProviders(<PRRow pr={p} repoId="r1" />);
}

describe("PRRow — cost column", () => {
  it("shows the PR's total run cost", () => {
    renderRow(pr({ cost_usd: 0.0039 }));
    expect(screen.getByText("$0.0039")).toHaveAttribute("title", "$0.003900");
  });

  it("shows a dash when no run has a known cost", () => {
    renderRow(pr({ cost_usd: null }));
    // score "—" + findings "—" + cost "—"
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});

describe("PRRow — findings column", () => {
  const finding = (id: string, severity: "CRITICAL" | "WARNING", title: string) => ({
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a **live** key.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv-new",
    accepted_at: null,
    dismissed_at: null,
  });

  it("shows only the severities present, and a dash when the PR has no review", () => {
    renderRow(pr({ id: "p1", findings_counts: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }, latest_review_id: "rv-new" }));
    expect(screen.getByLabelText("2 critical, 1 suggestion")).toBeInTheDocument();
    cleanup();
    renderRow(pr({ id: "p1", findings_counts: null, cost_usd: 0.01 }));
    expect(screen.getAllByText("—")).toHaveLength(2); // score + findings
  });

  it("hover loads the latest review and lists its findings read-only", async () => {
    const api = mockFetch({
      "GET /pulls/p1/reviews": [
        { id: "rv-new", run_id: "run-2", findings: [finding("f1", "CRITICAL", "Hardcoded Stripe secret key")] },
        { id: "rv-old", run_id: "run-1", findings: [finding("f0", "WARNING", "Old finding")] },
      ],
    });
    const { user } = renderRow(
      pr({ id: "p1", findings_counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }, latest_review_id: "rv-new" }),
    );
    expect(api.requests()).toHaveLength(0); // lazy: nothing until hover

    await user.hover(screen.getByLabelText("1 critical"));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("1 finding in this run");
    expect(await screen.findByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("Line 12 contains a live key.")).toBeInTheDocument();
    expect(screen.queryByText("Old finding")).toBeNull();
    expect(tip.querySelector("button")).toBeNull(); // no Accept/Dismiss here
    expect(api.requests("GET", "/pulls/p1/reviews")).toHaveLength(1);
  });
});
