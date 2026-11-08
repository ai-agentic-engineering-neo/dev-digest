import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastViewToggle } from "./BlastViewToggle";
import type { BlastView } from "./constants";

function renderToggle(value: BlastView, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastViewToggle value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("BlastViewToggle", () => {
  it("is one named group of two native buttons in the tab order, the active one pressed", () => {
    renderToggle("tree");
    const group = screen.getByRole("group", { name: messages.view.ariaLabel });
    const [tree, graph] = within(group).getAllByRole("button");
    expect(tree).toHaveAccessibleName("tree");
    expect(graph).toHaveAccessibleName("graph");
    expect(tree).toHaveAttribute("aria-pressed", "true");
    expect(graph).toHaveAttribute("aria-pressed", "false");
    // Native <button type="button">: focusable and activated by Enter/Space without extra key handlers.
    for (const b of [tree!, graph!]) {
      expect(b.tagName).toBe("BUTTON");
      expect(b).toHaveAttribute("type", "button");
      expect(b).not.toHaveAttribute("tabindex", "-1");
      expect(b).toBeEnabled();
    }
    graph!.focus();
    expect(graph).toHaveFocus();
  });

  it("reports the chosen view", () => {
    const onChange = renderToggle("tree");
    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(onChange).toHaveBeenCalledWith("graph");
  });
});
