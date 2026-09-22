/* SkillEditor — the unsaved-changes guard: while the draft is dirty, an in-app
   link away from the editor asks first; a clean editor never asks. The link
   stands in for next/link: its React onClick is the client-side navigation. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, fireEvent } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import type { SkillTab } from "@/app/skills/constants";
import { useSkill } from "@/lib/hooks";
import { SkillEditor } from "./SkillEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const navigate = vi.fn();

function Harness() {
  const [tab, setTab] = React.useState<SkillTab>("config");
  const { data } = useSkill("sk1");
  return (
    <>
      <a
        href="/agents"
        onClick={(e) => {
          e.preventDefault();
          navigate();
        }}
      >
        Agents
      </a>
      {data && <SkillEditor skill={data} tab={tab} onTab={setTab} />}
    </>
  );
}

beforeEach(() => {
  navigate.mockReset();
  mockFetch({ "GET /skills/sk1": makeSkill() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillEditor unsaved-changes guard", () => {
  it("a clean editor lets links navigate without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderWithProviders(<Harness />);
    await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("with unsaved changes a link away asks, and Cancel keeps the user on the page", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderWithProviders(<Harness />);
    await user.type(await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 }), "!");
    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes to this skill. Leave anyway?");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("confirming lets the navigation through", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderWithProviders(<Harness />);
    await user.type(await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 }), "!");
    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
