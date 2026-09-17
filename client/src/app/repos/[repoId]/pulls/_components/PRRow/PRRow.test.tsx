/**
 * PRRow — the FINDINGS column renders the latest review's severity breakdown
 * ("—" before a review), and interacting with its tooltip never navigates.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import prReview from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockReset();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 42,
    title: "Add billing",
    author: "octocat",
    branch: "feat/billing",
    base: "main",
    head_sha: "abc",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "reviewed",
    score: 70,
    cost_usd: null,
    findings: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — findings column", () => {
  it("shows per-severity counts for a reviewed PR", () => {
    const { container } = renderRow(
      pr({
        findings: {
          counts: { CRITICAL: 0, WARNING: 3, SUGGESTION: 1 },
          items: [
            { id: "w", severity: "WARNING", category: "bug", title: "Race", file: "a.ts", start_line: 1, end_line: 1, confidence: 0.7, rationale: "r" },
          ],
        },
      }),
    );
    expect(screen.getByLabelText("4 findings")).toBeInTheDocument();
    expect(container.querySelector('[data-severity="WARNING"]')?.textContent).toBe("3");
    expect(container.querySelector('[data-severity="SUGGESTION"]')?.textContent).toBe("1");
    expect(container.querySelector('[data-severity="CRITICAL"]')).toBeNull();
  });

  it("clicking inside the findings tooltip does not open the PR; the row still does", () => {
    renderRow(
      pr({
        findings: {
          counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
          items: [
            { id: "c", severity: "CRITICAL", category: "security", title: "Secret", file: "a.ts", start_line: 1, end_line: 1, confidence: 0.9, rationale: "r" },
          ],
        },
      }),
    );
    fireEvent.mouseEnter(screen.getByLabelText("1 finding"));
    fireEvent.click(screen.getByRole("tooltip"));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add billing"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/42");
  });

  it("shows — for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, findings: null }));
    // Score and findings both render the em-dash placeholder.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
