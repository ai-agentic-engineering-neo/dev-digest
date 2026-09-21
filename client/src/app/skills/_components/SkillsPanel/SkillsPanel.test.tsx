import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders, mockFetch, SKILL_ITEM } from "../../_test/harness";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { SkillsPanel } from "./SkillsPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});

const OTHER = { ...SKILL_ITEM, id: "s2", name: "no-then-chains" };

async function deleteRow(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Delete skill ${name}` }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
}

describe("SkillsPanel", () => {
  it("has a single Add Skill button (no dropdown) that opens the three-tab modal", async () => {
    mockFetch({ "GET /skills": [SKILL_ITEM] });
    renderWithProviders(<SkillsPanel activeId="s1" tab="config" />);
    await screen.findByText("pr-quality-rubric");

    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    expect(screen.getByText("Add skill")).toBeInTheDocument();
    for (const name of ["Create", "From file", "Import from URL"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("deleting the skill that is open on the right redirects to /skills", async () => {
    mockFetch({ "GET /skills": [SKILL_ITEM, OTHER], "DELETE /skills/s1": { ok: true } });
    renderWithProviders(<SkillsPanel activeId="s1" tab="config" />);
    await deleteRow("pr-quality-rubric");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
  });

  it("deleting a different skill stays on the open one", async () => {
    mockFetch({ "GET /skills": [SKILL_ITEM, OTHER], "DELETE /skills/s2": { ok: true } });
    renderWithProviders(<SkillsPanel activeId="s1" tab="config" />);
    await deleteRow("no-then-chains");
    await screen.findByText("Skill deleted");
    expect(push).not.toHaveBeenCalled();
  });
});
