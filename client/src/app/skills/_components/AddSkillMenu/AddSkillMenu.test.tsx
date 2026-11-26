import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { AddSkillMenu } from "./AddSkillMenu";

afterEach(cleanup);

function renderMenu() {
  const onCreate = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <AddSkillMenu onCreate={onCreate} />
    </NextIntlClientProvider>,
  );
  return onCreate;
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));

describe("AddSkillMenu", () => {
  it("lists the import entries as disabled 'soon' items", () => {
    const onCreate = renderMenu();
    openMenu();
    for (const name of ["Import from file", "Import from URL", "Search community skills…"]) {
      const item = screen.getByRole("button", { name: new RegExp(name) });
      expect(item).toHaveTextContent("soon");
      expect(item).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: /Import from file/ }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("opens the create flow from 'Create from scratch'", () => {
    const onCreate = renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Create from scratch" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
