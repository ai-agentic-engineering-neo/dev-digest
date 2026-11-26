import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { makeSkill } from "../fixtures";
import { mockFetch, renderWithProviders } from "../test-utils";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
// The real shell needs the repo context, theme and pulls; only its children matter here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillDetailView } from "./SkillDetailView";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.search = "";
  vi.unstubAllGlobals();
});

const GATE = makeSkill();

describe("SkillDetailView", () => {
  it("shows one skill full width with a back link, falls back to Config for ?tab=evals and switches tabs via the URL", async () => {
    nav.search = "tab=evals";
    mockFetch({ "GET /skills/sk1": GATE });
    renderWithProviders(<SkillDetailView skillId="sk1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "secret-leakage-gate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← All skills" })).toHaveAttribute("href", "/skills");
    expect(screen.getByRole("button", { name: "Save skill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /evals/i })).not.toBeInTheDocument();
    // Detail only: no skill list beside it.
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(nav.replace).toHaveBeenCalledWith("/skills/sk1?tab=preview");
  });

  it("opens the tab named in ?tab=", async () => {
    nav.search = "tab=versions";
    mockFetch({ "GET /skills/sk1": GATE, "GET /skills/sk1/versions": [] });
    renderWithProviders(<SkillDetailView skillId="sk1" />);
    expect(await screen.findByRole("heading", { name: "Version history" })).toBeInTheDocument();
  });

  it("says so when the skill does not exist", async () => {
    mockFetch({});
    renderWithProviders(<SkillDetailView skillId="nope" />);
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
  });
});
