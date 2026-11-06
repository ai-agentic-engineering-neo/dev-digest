import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/runs.json";
import type { SelectedAgent } from "../../../../types";
import { ConflictsSection, type ConflictsSectionProps } from "./ConflictsSection";

afterEach(cleanup);

const AGENTS: SelectedAgent[] = [
  { id: "a1", name: "Security", model: "m", colorIndex: 1 },
  { id: "a2", name: "Perf", model: "m", colorIndex: 2 },
];

const CONFLICTS: Conflict[] = [
  {
    file: "src/a.ts",
    line: 10,
    title: "Unsanitised query input",
    takes: [
      { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "SQL injection" },
      { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "" },
    ],
  },
  {
    file: "src/b.ts",
    line: 3,
    title: "Unused variable declared",
    takes: [
      { agent_id: "a1", persona: "Security", verdict: "ignored", note: "" },
      { agent_id: "a2", persona: "Perf", verdict: "SUGGESTION", note: "Unused var" },
    ],
  },
];

function renderSection(props: Partial<ConflictsSectionProps> = {}) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ConflictsSection
        conflicts={CONFLICTS}
        agents={AGENTS}
        countedCount={2}
        onlyConflicts={false}
        onToggleOnlyConflicts={onToggle}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onToggle;
}

describe("ConflictsSection", () => {
  it("renders conflicts with per-agent cells and toggles the filter", () => {
    const onToggle = renderSection();

    expect(screen.getByText("src/a.ts:10")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts:3")).toBeInTheDocument();
    expect(screen.getByText("Unsanitised query input")).toBeInTheDocument();
    expect(screen.getByText("Unused variable declared")).toBeInTheDocument();
    expect(screen.getAllByText("did not flag")).toHaveLength(2);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Show only conflicts" }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("shows the empty and need-two states", () => {
    renderSection({ conflicts: [] });
    expect(screen.getByText("Agents agree on every flagged location")).toBeInTheDocument();
    cleanup();

    renderSection({ conflicts: [], countedCount: 1 });
    expect(screen.getByText("Need at least two finished agents to compare")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
