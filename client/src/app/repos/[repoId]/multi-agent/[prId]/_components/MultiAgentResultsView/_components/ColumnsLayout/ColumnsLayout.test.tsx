import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared/contracts/observability";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { ColumnsLayout } from "./ColumnsLayout";

afterEach(cleanup);

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
    findings: [
      { id: "f1", severity: "CRITICAL", category: "security", title: "SQL injection", file: "src/db.ts", start_line: 10, kind: null },
    ],
    ...overrides,
  };
}

describe("ColumnsLayout (AC-25, AC-32)", () => {
  it("renders one column per grouped agent with name, status, score, summary, duration, cost and compact findings", () => {
    renderWithIntl(
      <ColumnsLayout columns={[column({})]} onlyConflicts={false} conflictFiles={new Set()} onOpenTrace={vi.fn()} />,
    );
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("Two critical findings.")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("src/db.ts")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });

  it("AC-27 — a participating agent with no findings states so rather than an empty result", () => {
    renderWithIntl(
      <ColumnsLayout
        columns={[column({ findings: [] })]}
        onlyConflicts={false}
        conflictFiles={new Set()}
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("No findings.")).toBeInTheDocument();
  });

  it("AC-28 — a grouped run with no summary states that no summary exists", () => {
    renderWithIntl(
      <ColumnsLayout
        columns={[column({ summary: null })]}
        onlyConflicts={false}
        conflictFiles={new Set()}
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("No summary.")).toBeInTheDocument();
  });

  it("AC-47 — a failed column renders marked with its recorded error, not silently dropped", () => {
    renderWithIntl(
      <ColumnsLayout
        columns={[column({ status: "failed", error: "Provider timed out after 30s", score: null, verdict: null, summary: null, findings: [] })]}
        onlyConflicts={false}
        conflictFiles={new Set()}
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Provider timed out after 30s")).toBeInTheDocument();
  });

  it("the view-logs affordance opens the trace drawer for this column's run", () => {
    const onOpenTrace = vi.fn();
    renderWithIntl(
      <ColumnsLayout columns={[column({})]} onlyConflicts={false} conflictFiles={new Set()} onOpenTrace={onOpenTrace} />,
    );
    fireEvent.click(screen.getByText("View trace"));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });

  it("AC-41 — the conflicts-only filter restricts findings to files that have a conflict", () => {
    renderWithIntl(
      <ColumnsLayout
        columns={[column({})]}
        onlyConflicts
        conflictFiles={new Set(["src/other.ts"])}
        onOpenTrace={vi.fn()}
      />,
    );
    expect(screen.queryByText("SQL injection")).not.toBeInTheDocument();
    expect(screen.getByText("No findings.")).toBeInTheDocument();
  });
});
