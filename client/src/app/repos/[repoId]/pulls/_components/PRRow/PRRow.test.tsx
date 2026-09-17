/**
 * The FINDINGS cell. Two invariants worth guarding:
 *  - a PR with no review shows "—", never a row of zeros;
 *  - the chips are READ-ONLY. They must not become buttons: clicking anywhere
 *    in the row opens the PR, and the cell's `help` cursor promises a preview,
 *    not navigation.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const reviews = vi.fn((_prId: string | null) => ({ data: [] as never[] }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string | null) => reviews(id) }));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

const PR: PrMeta = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "abc1234",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: "2026-09-17T08:00:00Z",
  updated_at: "2026-09-17T08:00:00Z",
  score: 61,
  cost_usd: 0.014,
  findings_counts: { CRITICAL: 2, WARNING: 1, SUGGESTION: 2 },
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

function findingsCell(): HTMLElement {
  return screen.getByLabelText("Findings by severity — hover for details");
}

describe("PRRow FINDINGS cell", () => {
  it("renders one chip per non-zero severity", () => {
    renderRow(PR);
    expect(findingsCell().textContent).toBe("212");
  });

  it("omits zero counts", () => {
    renderRow({ ...PR, findings_counts: { CRITICAL: 0, WARNING: 3, SUGGESTION: 0 } });
    expect(findingsCell().textContent).toBe("3");
  });

  it("renders — for a PR that has never been reviewed", () => {
    const { container } = renderRow({ ...PR, score: null, cost_usd: null, findings_counts: null });
    expect(screen.queryByLabelText(/Findings by severity/)).not.toBeInTheDocument();
    expect(container.textContent).toContain("—");
  });

  it("renders — for a PR reviewed clean (all zeros)", () => {
    renderRow({ ...PR, findings_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } });
    expect(screen.queryByLabelText(/Findings by severity/)).not.toBeInTheDocument();
  });

  it("the chips are not buttons — the cell is hover-only", () => {
    renderRow(PR);
    expect(findingsCell().querySelector("button")).toBeNull();
  });

  it("uses the help cursor only when there is something to preview", () => {
    renderRow(PR);
    expect(findingsCell()).toHaveStyle({ cursor: "help" });
    cleanup();
    const { container } = renderRow({ ...PR, findings_counts: null });
    const cells = Array.from(container.querySelectorAll("div"));
    expect(cells.some((c) => c.style.cursor === "help")).toBe(false);
  });

  it("clicking the cell still opens the PR, like any other cell in the row", () => {
    renderRow(PR);
    fireEvent.click(findingsCell());
    expect(push).toHaveBeenCalledWith("/repos/repo1/pulls/482");
  });

  it("does not fetch reviews until the cell is hovered", () => {
    renderRow(PR);
    expect(reviews).toHaveBeenLastCalledWith(null);
    fireEvent.mouseEnter(findingsCell());
    expect(reviews).toHaveBeenLastCalledWith("pr1");
  });
});
