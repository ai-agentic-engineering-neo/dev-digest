/**
 * PRRow — M1 cost badge: the COST cell shows the total spend of all agent runs and a
 * dash when it is unknown (never reviewed / legacy run without a stored cost).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
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
    head_sha: "a1b2c3d",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.0137,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows the latest run cost", () => {
    renderRow(pr({}));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows a dash when the cost is unknown", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    // score ring, cost and updated all fall back to "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});

function finding(id: string, severity: FindingRecord["severity"], title: string): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title,
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 45,
    rationale: "Why it matters.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("PRRow — findings column", () => {
  afterEach(() => push.mockClear());

  it("shows per-severity counts of the latest review's findings", () => {
    renderRow(
      pr({
        findings: [
          finding("a", "CRITICAL", "Hardcoded secret"),
          finding("b", "WARNING", "N+1 query"),
          finding("c", "WARNING", "Unbounded cache"),
        ],
      }),
    );
    expect(screen.getByRole("button", { name: /^1 Critical/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2 Warning/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).toBeNull();
  });

  it("shows a dash when the PR has no findings", () => {
    renderRow(pr({ findings: [], cost_usd: null }));
    expect(screen.queryByRole("group", { name: "Findings by severity" })).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("clicking a count opens the popover instead of opening the PR", () => {
    renderRow(pr({ findings: [finding("a", "CRITICAL", "Hardcoded secret")] }));
    fireEvent.click(screen.getByRole("button", { name: /^1 Critical/ }));
    expect(screen.getByRole("dialog", { name: "1 finding" })).toHaveTextContent("Hardcoded secret");
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482");
  });
});
