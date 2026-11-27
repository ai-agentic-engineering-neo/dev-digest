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
  it.each([
    ["Create from scratch", "create"],
    ["Import from file", "file"],
    ["Import from URL", "url"],
  ])("'%s' opens the dialog on the %s tab", (name, tab) => {
    const onCreate = renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    expect(onCreate).toHaveBeenCalledWith(tab);
  });

  it("community search is still a disabled 'soon' item", () => {
    const onCreate = renderMenu();
    openMenu();
    const item = screen.getByRole("button", { name: /Search community skills…/ });
    expect(item).toHaveTextContent("soon");
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
