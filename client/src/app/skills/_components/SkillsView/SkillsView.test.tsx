/* SkillsView — grid, search, type filter and the ?preview= drawer, with the
   real hooks over a stubbed API. AppShell is a passthrough. */
import type React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, within } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillsView } from "./SkillsView";

const SKILLS = [
  makeSkill({ id: "a", name: "no-then-chains", description: "Prefer async/await over .then chains", type: "convention" }),
  makeSkill({ id: "b", name: "secret-leakage-gate", description: "Flag hard-coded tokens", type: "security" }),
  makeSkill({ id: "c", name: "phantom-api-gate", description: "Flag calls to APIs that do not exist", type: "security", enabled: false }),
];

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  mockFetch({
    "GET /skills": SKILLS,
    "GET /skills/stats": [],
    "GET /skills/b": SKILLS[1]!,
    "GET /skills/b/agents": [{ id: "ag1", name: "Security Reviewer", enabled: true }],
  });
});
afterEach(cleanup);

const cardNames = () => screen.getAllByTestId("skill-card").map((c) => c.getAttribute("aria-label"));

describe("SkillsView", () => {
  it("renders the seeded skills as cards; a disabled card is dimmed", async () => {
    renderWithProviders(<SkillsView previewId={null} />);
    expect(await screen.findByText("no-then-chains")).toBeInTheDocument();
    expect(cardNames()).toEqual(["no-then-chains", "secret-leakage-gate", "phantom-api-gate"]);
    const disabled = screen.getAllByTestId("skill-card")[2]!;
    expect(disabled.style.opacity).toBe("0.55");
  });

  it("search filters by name and description", async () => {
    const { user } = renderWithProviders(<SkillsView previewId={null} />);
    await screen.findByText("no-then-chains");
    const search = screen.getByRole("textbox", { name: "Search skills…" });
    await user.type(search, "tokens");
    expect(cardNames()).toEqual(["secret-leakage-gate"]);
    await user.clear(search);
    await user.type(search, "PHANTOM");
    expect(cardNames()).toEqual(["phantom-api-gate"]);
    await user.clear(search);
    await user.type(search, "nothing-like-this");
    expect(screen.getByText("No matching skills")).toBeInTheDocument();
  });

  it("the type chips filter the grid", async () => {
    const { user } = renderWithProviders(<SkillsView previewId={null} />);
    await screen.findByText("no-then-chains");
    await user.click(screen.getByRole("button", { name: "security" }));
    expect(cardNames()).toEqual(["secret-leakage-gate", "phantom-api-gate"]);
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(cardNames()).toHaveLength(3);
  });

  it("clicking a card puts ?preview=<id> in the URL", async () => {
    const { user } = renderWithProviders(<SkillsView previewId={null} />);
    await user.click(await screen.findByText("secret-leakage-gate"));
    expect(nav.replace).toHaveBeenCalledWith("/skills?preview=b", { scroll: false });
  });

  it("?preview= opens the drawer with the body and Used by; Edit goes to the editor", async () => {
    const { user } = renderWithProviders(<SkillsView previewId="b" />);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText("secret-leakage-gate.md")).toBeInTheDocument();
    expect(within(drawer).getByText("Keep PRs focused.")).toBeInTheDocument();
    expect(await within(drawer).findByText("Security Reviewer")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Edit" }));
    expect(nav.push).toHaveBeenCalledWith("/skills/b?tab=config");
  });
});
