import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ProjectContextPromptRow } from "./ProjectContextPromptRow";

const LABEL = "Project context — attached specs (untrusted)";
const TEXT = '## Project context\n<!-- note -->\n\n<untrusted source="spec-0">\n### docs/a.md\n\nA\n</untrusted>';
const LABELS = {
  search: "Search in this block…",
  copy: "Copy",
  copied: "Copied",
  matchCount: (n: number) => `${n} lines`,
  noMatches: (q: string) => `No lines match “${q}”`,
  copyRow: `Copy ${LABEL}`,
  expand: `Expand ${LABEL}`,
};

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText } });
});

function renderRow() {
  render(<ProjectContextPromptRow label={LABEL} meta="~25 tokens" color="var(--accent)" text={TEXT} labels={LABELS} />);
}

describe("ProjectContextPromptRow", () => {
  it("shows the label and the token estimate", () => {
    renderRow();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByText("~25 tokens")).toBeInTheDocument();
  });

  it("copies the whole section", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: `Copy ${LABEL}` }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("expands into the search dialog and returns focus to the expand button on Escape", () => {
    renderRow();
    const expand = screen.getByRole("button", { name: `Expand ${LABEL}` });
    fireEvent.click(expand);
    const dialog = screen.getByRole("dialog", { name: LABEL });
    expect(within(dialog).getByRole("textbox", { name: "Search in this block…" })).toHaveFocus();
    fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(expand).toHaveFocus();
  });
});
