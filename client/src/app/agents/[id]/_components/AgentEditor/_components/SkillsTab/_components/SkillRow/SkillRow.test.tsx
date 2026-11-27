import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/agents.json";
import { SkillRow, type SkillRowProps } from "./SkillRow";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "secret-leakage-gate",
  description: "",
  type: "security",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  agent_count: 0,
};

function renderRow(props: Partial<SkillRowProps> = {}) {
  const onToggle = vi.fn();
  const onMove = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ul>
        <SkillRow
          row={{ skill: SKILL, attached: true, position: 0 }}
          reorderable
          hintId="hint"
          dnd={{ active: false, isDragging: false, onStart: vi.fn(), onEnd: vi.fn(), onDrop: vi.fn() }}
          onToggle={onToggle}
          onMove={onMove}
          {...props}
        />
      </ul>
    </NextIntlClientProvider>,
  );
  return { onToggle, onMove, row: screen.getByRole("listitem", { name: SKILL.name }) };
}

describe("SkillRow", () => {
  it("toggles via the checkbox and moves with Alt+arrows when attached", () => {
    const { onToggle, onMove, row } = renderRow();
    expect(row).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    expect(screen.getByText("Security")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: SKILL.name }));
    expect(onToggle).toHaveBeenCalledOnce();
    fireEvent.keyDown(row, { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
  });

  it("cannot be moved when unattached, and shows the disabled badge for a globally off skill", () => {
    const { onMove, row } = renderRow({
      row: { skill: { ...SKILL, enabled: false }, attached: false, position: null },
    });
    expect(row).toHaveAttribute("draggable", "false");
    expect(row).not.toHaveAttribute("aria-keyshortcuts");
    expect(screen.getByRole("checkbox", { name: SKILL.name })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("disabled")).toBeInTheDocument();
    fireEvent.keyDown(row, { key: "ArrowUp", altKey: true });
    expect(onMove).not.toHaveBeenCalled();
  });

  const FLAGGED: Skill = {
    ...SKILL,
    enabled: false,
    safety: {
      status: "flagged",
      findings: [{ rule: "suppress-findings", severity: "block", line: 1, start: 0, end: 4, excerpt: "x" }],
      scanner_version: 1,
      scanned_at: "t",
    },
  };

  it("a flagged skill is framed in red, says so, and cannot be ticked", () => {
    const { onToggle, row } = renderRow({ row: { skill: FLAGGED, attached: false, position: null } });
    expect(row).toHaveAttribute("data-flagged", "true");
    expect(row).toHaveAttribute("title", expect.stringContaining("fix it on the skill's Config tab"));
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
    expect(screen.queryByText("disabled")).not.toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: SKILL.name });
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("a linked skill that got flagged can only be unticked, not moved", () => {
    const { onToggle, onMove, row } = renderRow({ row: { skill: FLAGGED, attached: true, position: 0 } });
    expect(row).toHaveAttribute("draggable", "false");
    expect(row).toHaveAttribute("title", expect.stringContaining("you can only unlink it"));
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: SKILL.name }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
