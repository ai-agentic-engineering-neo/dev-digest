import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared/contracts/observability";
import messages from "../../../../../../../../messages/en/runs.json";
import { ConflictsSection } from "./ConflictsSection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CONFLICT: Conflict = {
  file: "src/auth.ts",
  line: 42,
  title: "Missing input validation",
  takes: [
    { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "Untrusted input reaches the query." },
    { agent_id: "a2", persona: "Style", verdict: "ignored", note: "" },
  ],
};

describe("ConflictsSection", () => {
  it("AC-42 — fewer than two participants states that comparing stances needs two runs, not 'no conflicts'", () => {
    renderWithIntl(<ConflictsSection conflicts={[]} participants={1} onlyConflicts={false} onToggleOnly={vi.fn()} />);
    expect(screen.getByText("Comparing stances needs at least two successful agent runs.")).toBeInTheDocument();
  });

  it("AC-40 — zero conflicts with >=2 participants states the agents agree, not an empty list", () => {
    renderWithIntl(<ConflictsSection conflicts={[]} participants={2} onlyConflicts={false} onToggleOnly={vi.fn()} />);
    expect(screen.getByText("No conflicts — the agents agree on every flagged location.")).toBeInTheDocument();
  });

  it("AC-39 — a conflict presents file:line, title, and per-agent severity or did-not-flag", () => {
    renderWithIntl(
      <ConflictsSection conflicts={[CONFLICT]} participants={2} onlyConflicts={false} onToggleOnly={vi.fn()} />,
    );
    expect(screen.getByText("src/auth.ts:42")).toBeInTheDocument();
    expect(screen.getByText("Missing input validation")).toBeInTheDocument();
    expect(screen.getByText("did not flag")).toBeInTheDocument();
  });

  it("the conflicts-only toggle calls back on change", () => {
    const onToggleOnly = vi.fn();
    renderWithIntl(
      <ConflictsSection conflicts={[CONFLICT]} participants={2} onlyConflicts={false} onToggleOnly={onToggleOnly} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleOnly).toHaveBeenCalledTimes(1);
  });
});
