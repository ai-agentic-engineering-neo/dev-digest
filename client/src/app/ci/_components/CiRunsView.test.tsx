/* CiRunsView.test.tsx — hermetic RTL tests for the global CI Runs page.
   Covers: required columns + a `pr_id: null` row rendering correctly (AC-33),
   a degraded refresh surfacing a banner while the existing rows stay put
   (AC-32), and the empty state. Hooks are mocked at the module boundary
   (this codebase's established pattern — see client/insights/gotchas.md,
   there is no MSW dependency installed) so this test stays independent of
   the server `ci` module (Track B/T6). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import messages from "../../../../messages/en/ci.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockUseCiRuns = vi.fn();
const mockUseRefreshCiRuns = vi.fn();
vi.mock("@/lib/hooks/ci-runs", () => ({
  useCiRuns: (...args: unknown[]) => mockUseCiRuns(...args),
  useRefreshCiRuns: (...args: unknown[]) => mockUseRefreshCiRuns(...args),
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsView />
    </NextIntlClientProvider>,
  );
}

const RUNS: CiRun[] = [
  {
    id: "run-1",
    ci_installation_id: "inst-1",
    pr_id: "pr-1",
    repo: "acme/api",
    pr_number: 42,
    ran_at: "2026-07-01T10:00:00.000Z",
    agent: "Security Reviewer",
    status: "succeeded",
    verdict: "approve",
    findings_count: 3,
    blockers: 0,
    score: 92,
    cost_usd: 0.014,
    duration_s: 12,
    actions_job_url: "https://github.com/acme/api/actions/runs/123",
    source: "ci",
  },
  {
    // External/fork PR — no internal PR row (AC-33).
    id: "run-2",
    ci_installation_id: "inst-1",
    pr_id: null,
    repo: "acme/api",
    pr_number: 7,
    ran_at: "2026-07-02T10:00:00.000Z",
    agent: "Security Reviewer",
    status: "failed",
    verdict: "request_changes",
    findings_count: 5,
    blockers: 2,
    score: 40,
    cost_usd: null,
    duration_s: 90,
    actions_job_url: null,
    source: "ci",
  },
];

describe("CiRunsView", () => {
  it("renders the required columns and a row where pr_id is null (AC-33)", () => {
    mockUseCiRuns.mockReturnValue({ data: RUNS, isLoading: false, isError: false, refetch: vi.fn() });
    mockUseRefreshCiRuns.mockReturnValue({ mutate: vi.fn(), isPending: false, data: undefined });

    renderView();

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    for (const name of [
      /pull request/i,
      /repository/i,
      /agent/i,
      /status/i,
      /findings/i,
      /cost/i,
      /duration/i,
      /actions job/i,
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }

    // Row with an internal PR (pr_id set) renders its PR number.
    const [firstRun] = RUNS;
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute(
      "href",
      firstRun!.actions_job_url as string,
    );

    // Row with pr_id === null still renders without crashing, falling back to
    // the raw pr_number (no internal link) — and its other columns are intact.
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getAllByText("acme/api")).toHaveLength(2);
    expect(screen.getAllByText("Security Reviewer")).toHaveLength(2);
  });

  it("shows a degraded banner on refresh while preserving the existing rows (AC-32)", () => {
    mockUseCiRuns.mockReturnValue({ data: RUNS, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    mockUseRefreshCiRuns.mockReturnValue({
      mutate,
      isPending: false,
      data: { degraded: true, message: "GitHub rate limit reached — showing last known runs." },
    });

    renderView();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(mutate).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("status")).toHaveTextContent(/rate limit/i);
    // Rows from before the refresh are still rendered — nothing was cleared.
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("shows the empty state when there are no CI runs", () => {
    mockUseCiRuns.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mockUseRefreshCiRuns.mockReturnValue({ mutate: vi.fn(), isPending: false, data: undefined });

    renderView();

    expect(screen.getByText(messages.runs.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
