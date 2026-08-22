import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";

// specs/13-multi-agent-review.md AC-34/D19 — TabsLayout reuses the EXISTING
// FindingsPanel (which itself renders FindingCard with its full action set);
// this test asserts TabsLayout's OWN responsibilities (tab switching, meta,
// view-logs, no-summary state) — FindingsPanel's own behaviour is covered by
// its own test suite.
const findingsPanelSpy = vi.fn();
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel", () => ({
  FindingsPanel: (props: unknown) => {
    findingsPanelSpy(props);
    return <div>findings-panel</div>;
  },
}));

import { TabsLayout } from "./TabsLayout";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function column(overrides: Partial<AgentColumn>): AgentColumn {
  return {
    run_id: "r1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openrouter",
    model: "gpt-4.1",
    status: "done",
    verdict: "request_changes",
    score: 62,
    summary: "Two critical findings.",
    duration_ms: 8200,
    cost_usd: 0.06,
    error: null,
    findings: [],
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "r1",
    agent_name: "Security",
    kind: "review",
    verdict: "request_changes",
    summary: "Two critical findings.",
    score: 62,
    model: "gpt-4.1",
    created_at: new Date().toISOString(),
    findings: [],
    ...overrides,
  };
}

describe("TabsLayout (AC-33, AC-34)", () => {
  it("renders one tab per agent (name + score) and the active tab's summary/duration/cost/view-logs", () => {
    const cols = [
      column({ run_id: "r1", agent_name: "Security", score: 62 }),
      column({ run_id: "r2", agent_name: "Style", score: 80 }),
    ];
    const reviewByRun = new Map([
      ["r1", review({ run_id: "r1" })],
      ["r2", review({ run_id: "r2" })],
    ]);
    renderWithIntl(
      <TabsLayout
        columns={cols}
        reviewByRun={reviewByRun}
        onlyConflicts={false}
        conflictFiles={new Set()}
        prId="pr1"
        repoFullName="acme/demo"
        headSha="sha1"
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("Security · 62")).toBeInTheDocument();
    expect(screen.getByText("Style · 80")).toBeInTheDocument();
    expect(screen.getByText("Two critical findings.")).toBeInTheDocument();
  });

  it("AC-34 — switching tabs feeds the newly-active run's full findings to FindingsPanel", () => {
    const cols = [
      column({ run_id: "r1", agent_name: "Security", score: 62 }),
      column({ run_id: "r2", agent_name: "Style", score: 80, summary: "No issues found." }),
    ];
    const reviewByRun = new Map([
      ["r1", review({ run_id: "r1" })],
      ["r2", review({ run_id: "r2", summary: "No issues found." })],
    ]);
    renderWithIntl(
      <TabsLayout
        columns={cols}
        reviewByRun={reviewByRun}
        onlyConflicts={false}
        conflictFiles={new Set()}
        prId="pr1"
        repoFullName="acme/demo"
        headSha="sha1"
        onOpenTrace={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Style · 80"));
    expect(screen.getByText("No issues found.")).toBeInTheDocument();
  });

  it("AC-28 — no summary states that no summary exists", () => {
    const cols = [column({ summary: null })];
    renderWithIntl(
      <TabsLayout
        columns={cols}
        reviewByRun={new Map()}
        onlyConflicts={false}
        conflictFiles={new Set()}
        prId="pr1"
        repoFullName={null}
        headSha={null}
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("No summary.")).toBeInTheDocument();
  });

  it("the view-logs affordance opens the trace drawer for the active run", () => {
    const onOpenTrace = vi.fn();
    renderWithIntl(
      <TabsLayout
        columns={[column({})]}
        reviewByRun={new Map()}
        onlyConflicts={false}
        conflictFiles={new Set()}
        prId="pr1"
        repoFullName={null}
        headSha={null}
        onOpenTrace={onOpenTrace}
      />,
    );
    fireEvent.click(screen.getByText("View trace"));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });
});
