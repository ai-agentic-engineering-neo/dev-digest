import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
