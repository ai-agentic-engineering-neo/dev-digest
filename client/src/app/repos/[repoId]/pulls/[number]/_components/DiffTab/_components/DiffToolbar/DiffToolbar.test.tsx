import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { DiffToolbar } from "./DiffToolbar";

const LABELS = { toolbar: "Diff view", smart: "Smart order", original: "Original order" };

function renderToolbar(disabled = false) {
  const onModeChange = vi.fn();
  const onToggle = vi.fn();
  render(
    <DiffToolbar
      mode="smart"
      onModeChange={onModeChange}
      findingsToggle={{ label: "Hide findings (8)", shown: true, disabled, onToggle }}
      labels={LABELS}
    />,
  );
  return { onModeChange, onToggle };
}

describe("DiffToolbar", () => {
  it("is one toolbar with three controls in order and wires their handlers", () => {
    const { onModeChange, onToggle } = renderToolbar();
    const buttons = within(screen.getByRole("group", { name: "Diff view" })).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Smart order", "Original order", "Hide findings (8)"]);
    fireEvent.click(buttons[1]!);
    expect(onModeChange).toHaveBeenCalledWith("original");
    fireEvent.click(buttons[2]!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("disables the findings toggle when nothing can be hidden", () => {
    renderToolbar(true);
    expect(screen.getByRole("button", { name: "Hide findings (8)" })).toBeDisabled();
  });
});
