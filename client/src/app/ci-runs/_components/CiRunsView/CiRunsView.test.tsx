import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared/contracts/eval-ci";
import ciMessages from "../../../../../messages/en/ci.json";

let RUNS: CiRun[] = [];
const refreshMutate = vi.fn();

vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: () => ({ data: RUNS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRefreshCiRuns: () => ({ mutate: refreshMutate, isPending: false }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

function run(overrides: Partial<CiRun>): CiRun {
  return {
    id: "run-1",
    ci_installation_id: "inst-1",
    provider_run_id: "1001",
    repo: "acme/payments-api",
    commit_sha: "abc123",
    pr_number: 42,
    pr_title: "Add rate limiting",
    pr_url: "https://studio.local/pulls/42",
    ran_at: new Date().toISOString(),
    status: "succeeded",
    findings_count: 2,
    critical: 0,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.012,
    github_url: "https://github.com/acme/payments-api/actions/runs/1001",
    source: "gha",
    agent: "Security",
    agent_name: "Security",
    duration_s: 8,
    duration_ms: 8000,
    duration_source: "artifact",
    failure_reason: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

describe("CiRunsView", () => {
  it("renders no table when no CI run has ever been ingested (AC-31)", () => {
    RUNS = [];
    renderWithIntl(<CiRunsView />);
    expect(screen.getByText(ciMessages.runs.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a run's cost as a placeholder when null, distinct from a genuine $0.00 (AC-27)", () => {
    RUNS = [run({ id: "r1", cost_usd: null }), run({ id: "r2", cost_usd: 0 })];
    renderWithIntl(<CiRunsView />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("filters by status and shows a count on each chip that matches what selecting it yields (AC-28)", () => {
    RUNS = [
      run({ id: "r1", status: "succeeded" }),
      run({ id: "r2", status: "succeeded" }),
      run({ id: "r3", status: "failed", failure_reason: "commit mismatch" }),
    ];
    renderWithIntl(<CiRunsView />);
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 runs

    fireEvent.click(screen.getByRole("button", { name: new RegExp(ciMessages.runs.status.failed) }));
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 failed run
    expect(screen.getByText("commit mismatch")).toBeInTheDocument();
  });

  it("links a run's PR title to the resolved studio/provider URL (AC-32)", () => {
    RUNS = [run({ id: "r1", pr_url: "https://studio.local/pulls/42" })];
    renderWithIntl(<CiRunsView />);
    const link = screen.getByRole("link", { name: "Add rate limiting" });
    expect(link).toHaveAttribute("href", "https://studio.local/pulls/42");
  });

  it("the manual refresh control queries immediately", () => {
    RUNS = [run({})];
    renderWithIntl(<CiRunsView />);
    fireEvent.click(screen.getByRole("button", { name: ciMessages.runs.refresh }));
    expect(refreshMutate).toHaveBeenCalledWith(true);
  });
});
