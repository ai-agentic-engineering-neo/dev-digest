import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import runs from "@/../messages/en/runs.json";
import prReview from "@/../messages/en/prReview.json";
import type { AgentColumnView } from "../../../../types";
import { TabsView } from "./TabsView";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn() }),
}));

afterEach(cleanup);

function finding(id: string, title: string): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "security",
    title,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
  };
}

function run(id: string): RunSummary {
  return {
    run_id: id,
    agent_id: id,
    agent_name: id,
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: 8240,
    tokens_in: null,
    tokens_out: null,
    cost_usd: 0.01,
    findings_count: 2,
    grounding: null,
    ran_at: null,
    score: 80,
    blockers: 0,
  };
}

function doneColumn(
  id: string,
  name: string,
  colorIndex: number,
  summary: string,
  findings: FindingRecord[],
): AgentColumnView {
  const review: Extract<AgentColumnView["state"], { kind: "done" }>["review"] = {
    id: `rev-${id}`,
    run_id: id,
    summary,
    score: 80,
    findings,
  } as Extract<AgentColumnView["state"], { kind: "done" }>["review"];
  return {
    agent: { id, name, model: "m", colorIndex },
    state: { kind: "done", run: run(id), review },
    findings,
  };
}

function buildColumns(): AgentColumnView[] {
  return [
    doneColumn("a1", "Security", 1, "Security summary", [finding("f1", "Leaked key")]),
    doneColumn("a2", "Style", 2, "Style summary", [finding("f2", "Bad name"), finding("f3", "Long line")]),
  ];
}

function renderTabs(onlyFindingIds: ReadonlySet<string> | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs, prReview }}>
      <TabsView
        prId="pr1"
        columns={buildColumns()}
        onlyFindingIds={onlyFindingIds}
        onViewTrace={() => {}}
        onRetry={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("TabsView", () => {
  it("shows one agent at a time and switches tabs", () => {
    renderTabs();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("Security summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Style/ }));
    expect(screen.getByText("Style summary")).toBeInTheDocument();
    expect(screen.queryByText("Security summary")).not.toBeInTheDocument();
    expect(screen.getByText("Bad name")).toBeInTheDocument();
    expect(screen.getByText("Long line")).toBeInTheDocument();
  });

  it("hides findings outside the conflict set", () => {
    renderTabs(new Set(["f3"]));
    fireEvent.click(screen.getByRole("tab", { name: /Style/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Long line")).toBeInTheDocument();
    expect(within(panel).queryByText("Bad name")).not.toBeInTheDocument();
  });
  it("colors a 72 tab score warn, not ok (matches the kit circle)", () => {
    const base = buildColumns()[0]!;
    if (base.state.kind !== "done") throw new Error("fixture must be done");
    const column: AgentColumnView = {
      ...base,
      state: { ...base.state, review: { ...base.state.review, score: 72 } },
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ runs, prReview }}>
        <TabsView prId="pr1" columns={[column]} onlyFindingIds={null} onViewTrace={() => {}} onRetry={() => {}} />
      </NextIntlClientProvider>,
    );
    const tabScore = within(screen.getByRole("tab")).getByText("72");
    expect(tabScore).toHaveStyle({ color: "var(--warn)" });
    expect(tabScore).not.toHaveStyle({ color: "var(--ok)" });
  });
});
