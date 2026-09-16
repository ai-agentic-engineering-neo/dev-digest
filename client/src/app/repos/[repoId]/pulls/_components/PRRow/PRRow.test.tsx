import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 100,
    deletions: 20,
    files_count: 3,
    status: "needs_review",
    opened_at: null,
    updated_at: "2026-06-13T20:52:51.000Z",
    score: 61,
    ...o,
  };
}

function renderRow(row: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={row} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows a known cost formatted as USD", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' (never '$0.00') when cost is unknown", () => {
    renderRow(pr({ cost_usd: null }));
    // The cost cell and the Findings cell (no findings_summary in the fixture)
    // both render "—".
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows '—' for a PR that has never been reviewed (cost_usd absent)", () => {
    renderRow(pr({ score: null, cost_usd: undefined }));
    // The score cell (unreviewed), Findings cell (no summary) and cost cell
    // (no data) all render "—".
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});

function findingsSummary() {
  return {
    counts: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 },
    items: [
      {
        id: "f1",
        severity: "CRITICAL" as const,
        category: "security" as const,
        title: "Hardcoded Stripe secret key in commit",
        file: "src/config.ts",
        start_line: 12,
        end_line: 12,
        confidence: 0.98,
        rationale: "Line 12 contains a literal string starting with sk_live_.",
      },
      {
        id: "f2",
        severity: "CRITICAL" as const,
        category: "security" as const,
        title: "Lethal trifecta: untrusted input reaches exfil path",
        file: "src/api/public/webhooks.ts",
        start_line: 61,
        end_line: 74,
        confidence: 0.79,
        rationale: "The webhook handler reads attacker-controllable input.",
      },
      {
        id: "f3",
        severity: "SUGGESTION" as const,
        category: "style" as const,
        title: "Extract magic number 3600",
        file: "src/middleware/rateLimit.ts",
        start_line: 28,
        end_line: 28,
        confidence: 0.62,
        rationale: "The number 3600 appears twice without explanation.",
      },
    ],
  };
}

describe("PRRow — Findings cell", () => {
  it("shows '—' when the PR has no review yet", () => {
    renderRow(pr({ findings_summary: null }));
    // The findings cell (no summary) and cost cell (fixture's default
    // cost_usd is unset) both render "—"; the fixture's score is reviewed.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows a muted 0 (not '—') when the latest review found nothing", () => {
    renderRow(pr({ findings_summary: { counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, items: [] } }));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders only the non-zero severity counters, matching the counts", () => {
    renderRow(pr({ findings_summary: findingsSummary() }));
    expect(screen.getByText("2")).toBeInTheDocument(); // CRITICAL
    expect(screen.getByText("1")).toBeInTheDocument(); // SUGGESTION
  });

  it("clicking the counter does not navigate to the PR (stops propagation)", () => {
    renderRow(pr({ findings_summary: findingsSummary() }));
    fireEvent.click(screen.getByRole("button"));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("hovering the counter opens a read-only popover titled with the total count", () => {
    renderRow(pr({ findings_summary: findingsSummary() }));
    fireEvent.mouseEnter(screen.getByRole("button"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("3 FINDINGS");
    // Every item shows up, in severity order.
    expect(within(dialog).getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(within(dialog).getByText("Extract magic number 3600")).toBeInTheDocument();
    expect(within(dialog).getByText(/src\/config\.ts:12/)).toBeInTheDocument();
    // Read-only: no accept/dismiss/other buttons inside the popover.
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
  });

  it("moving the mouse away from both the trigger and the popover closes it", async () => {
    renderRow(pr({ findings_summary: findingsSummary() }));
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
