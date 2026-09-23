/* SkillEditorView — the agents-style layout (skill list sidebar + the editor
   for the selected skill) and the unsaved-draft guard on every way out: a
   sidebar row, a skill created from the sidebar's Add Skill menu, and an in-app
   link. Real hooks over a stubbed API; AppShell is a passthrough. The link
   stands in for next/link: its React onClick is the client-side navigation. */
import type React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, fireEvent, waitFor, within } from "@/test/render";
import { mockFetch, jsonResponse, type RouteHandler } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillEditorView } from "./SkillEditorView";

const A = makeSkill({ id: "a", name: "no-then-chains", type: "convention" });
const B = makeSkill({ id: "b", name: "secret-leakage-gate", type: "security" });
const UNSAVED = "You have unsaved changes to this skill. Leave anyway?";

function stub(overrides: Record<string, RouteHandler> = {}) {
  return mockFetch({ "GET /skills": [A, B], "GET /skills/a": A, "GET /skills/b": B, ...overrides });
}

const navigate = vi.fn();

/** The view next to an in-app link (the link guard's target). */
function Screen({ tab = "config" as const }: { tab?: "config" | "versions" }) {
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
      <SkillEditorView id="a" tab={tab} />
    </>
  );
}

const sidebar = () => screen.getByRole("complementary", { name: "Skills" });
const row = (name: string) => within(sidebar()).findByRole("button", { name });
const skillBody = () => screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillEditorView", () => {
  it("lists every skill with the open one highlighted; another skill opens on the same tab; tabs replace ?tab=", async () => {
    stub();
    const { user } = renderWithProviders(<Screen tab="versions" />);
    expect(await screen.findByRole("heading", { name: "no-then-chains.md" })).toBeInTheDocument();
    expect(await row("no-then-chains")).toHaveAttribute("aria-current", "true");
    expect(await row("secret-leakage-gate")).not.toHaveAttribute("aria-current");

    await user.click(await row("secret-leakage-gate"));
    expect(nav.push).toHaveBeenCalledWith("/skills/b?tab=versions");
    await user.click(screen.getByRole("button", { name: /Stats/ }));
    expect(nav.replace).toHaveBeenCalledWith("/skills/a?tab=stats");
  });

  it("switching skills: clean goes straight; dirty asks, Cancel keeps the draft, OK leaves", async () => {
    stub();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderWithProviders(<Screen />);
    const body = await skillBody();

    await user.click(await row("secret-leakage-gate"));
    expect(confirm).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledTimes(1);

    await user.type(body, "!");
    await user.click(await row("secret-leakage-gate"));
    expect(confirm).toHaveBeenCalledWith(UNSAVED);
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue(`${A.body}!`);

    confirm.mockReturnValue(true);
    await user.click(await row("secret-leakage-gate"));
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenLastCalledWith("/skills/b?tab=config");
  });

  it("an in-app link: clean navigates; dirty asks and Cancel keeps the user on the page", async () => {
    stub();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderWithProviders(<Screen />);
    const body = await skillBody();

    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);

    await user.type(body, "!");
    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(confirm).toHaveBeenCalledWith(UNSAVED);
    expect(navigate).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "Agents" }));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("a skill created from the sidebar with a dirty draft asks before opening it", async () => {
    const api = stub({ "POST /skills": makeSkill({ id: "new1", name: "fresh-skill" }) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderWithProviders(<Screen />);
    await user.type(await skillBody(), "!");

    await user.click(within(sidebar()).getByRole("button", { name: /Add Skill/ }));
    await user.click(screen.getByRole("button", { name: "Create from scratch" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "fresh-skill");
    await user.click(within(dialog).getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(api.requests("POST", "/skills")).toHaveLength(1));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(UNSAVED));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue(`${A.body}!`);
  });

  it("a skill that fails to load shows the error next to the list", async () => {
    stub({ "GET /skills/a": jsonResponse({ error: { code: "not_found", message: "nope" } }, 404) });
    renderWithProviders(<Screen />);
    expect(await screen.findByText("Couldn’t load this skill")).toBeInTheDocument();
    expect(await row("secret-leakage-gate")).toBeInTheDocument();
  });

  it("deleting the open skill from the sidebar goes back to the grid", async () => {
    const api = stub({ "GET /skills/a/agents": [], "DELETE /skills/a": { ok: true } });
    const { user } = renderWithProviders(<Screen />);
    await screen.findByRole("heading", { name: "no-then-chains.md" });
    await user.click(within(sidebar()).getByRole("button", { name: "Delete no-then-chains" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(api.requests("DELETE", "/skills/a")).toHaveLength(1));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/skills"));
  });
});
