import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { makeSkill } from "../fixtures";
import { fetchCalls, mockFetch, renderWithProviders } from "../test-utils";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
// The real shell needs the repo context, theme and pulls; only its children matter here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillsView } from "./SkillsView";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  nav.replace.mockReset();
  vi.unstubAllGlobals();
});

const GATE = makeSkill();
const RUBRIC = makeSkill({
  id: "sk2",
  name: "pr-quality-rubric",
  description: "Scores the PR",
  type: "rubric",
  agent_count: 0,
  version: 1,
  body: "# Rubric",
});

describe("SkillsView", () => {
  it("shows the skills as a card grid, filters them and opens one on its Config tab", async () => {
    mockFetch({ "GET /skills": [GATE, RUBRIC] });
    renderWithProviders(<SkillsView />);

    expect(await screen.findByRole("heading", { level: 1, name: "Skills" })).toBeInTheDocument();
    expect(await screen.findByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("0 agents · v1")).toBeInTheDocument();
    // No master-detail list any more: nothing to select, no side pane.
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText("Select a skill")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "scores" } });
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Scores the PR"));
    expect(nav.push).toHaveBeenCalledWith("/skills/sk2?tab=config");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("No skills match “zzz”.")).toBeInTheDocument();
  });

  it("toggles a skill from its card", async () => {
    const spy = mockFetch({
      "GET /skills": [GATE],
      "PUT /skills/sk1": (patch) => ({ body: { ...GATE, ...(patch as object) } }),
    });
    renderWithProviders(<SkillsView />);
    fireEvent.click(await screen.findByRole("switch", { name: "Enabled" }));
    await waitFor(() =>
      expect(fetchCalls(spy).filter(([m]) => m === "PUT")).toEqual([["PUT", "/skills/sk1", { enabled: false }]]),
    );
  });

  it("deletes a skill from its card after confirming; Cancel deletes nothing", async () => {
    let deleted = false;
    const spy = mockFetch({
      "GET /skills": () => ({ body: deleted ? [RUBRIC] : [GATE, RUBRIC] }),
      "GET /skills/sk1/agents": [{ agent_id: "a1", agent_name: "Security Reviewer" }],
      "DELETE /skills/sk1": () => {
        deleted = true;
        return { body: { ok: true } };
      },
    });
    renderWithProviders(<SkillsView />);

    const trash = await screen.findAllByRole("button", { name: "Delete skill" });
    fireEvent.click(trash[0]!);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Delete secret-leakage-gate?");
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchCalls(spy).map(([m]) => m)).not.toContain("DELETE");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete skill" })[0]!);
    expect(await screen.findByText("Used by 1 agent: Security Reviewer")).toBeInTheDocument();
    // The dialog's confirm button has the same name as the card buttons: query inside the dialog.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete skill" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchCalls(spy)).toContainEqual(["DELETE", "/skills/sk1", undefined]);
    await waitFor(() => expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument());
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
  });

  it("shows the empty state with a create CTA, and a load error with retry", async () => {
    mockFetch({ "GET /skills": [] });
    renderWithProviders(<SkillsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Create your first skill" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Create skill");
    cleanup();

    const spy = mockFetch({ "GET /skills": () => ({ status: 500, body: {} }) });
    renderWithProviders(<SkillsView />);
    expect(await screen.findByText("Could not load skills.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
