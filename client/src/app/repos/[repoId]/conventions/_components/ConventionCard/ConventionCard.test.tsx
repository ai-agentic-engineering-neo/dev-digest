import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  category: "naming",
  rule: "Always use async/await instead of .then() chains",
  rationale: "Keeps error handling consistent.",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("ConventionCard (smoke)", () => {
  it("renders the rule, category, evidence and confidence", () => {
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onStatus={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("naming")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("calls onStatus('accepted') when Accept is clicked", () => {
    const onStatus = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onStatus={onStatus} onSave={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onStatus).toHaveBeenCalledWith("accepted");
  });

  it("calls onStatus('rejected') when Reject is clicked", () => {
    const onStatus = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onStatus={onStatus} onSave={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onStatus).toHaveBeenCalledWith("rejected");
  });

  it("toggling accept on an already-accepted candidate moves it back to pending", () => {
    const onStatus = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={{ ...CANDIDATE, status: "accepted" }} onStatus={onStatus} onSave={vi.fn()} onDelete={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Accepted"));
    expect(onStatus).toHaveBeenCalledWith("pending");
  });

  it("edit mode: Save calls onSave with the trimmed rule/rationale and exits edit mode", () => {
    const onSave = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onStatus={vi.fn()} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Edit rule"));
    const ruleInput = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(ruleInput, { target: { value: "  Edited rule  " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith({ rule: "Edited rule", rationale: "Keeps error handling consistent." });
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("calls onDelete when the trash icon is clicked", () => {
    const onDelete = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onStatus={vi.fn()} onSave={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete candidate"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("shows a selection checkbox only when selectable, and reports selection changes", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "accepted" }}
        selectable
        selected
        onSelect={onSelect}
        onStatus={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledWith(false);
  });
});
