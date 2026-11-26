import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { makeSkill } from "../fixtures";
import { queryKeys } from "@/lib/hooks/keys";
import { fetchCalls, makeTestQueryClient, mockFetch, renderWithProviders } from "../test-utils";

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

  it("?suggest=1 after a merge: the conflicts dialog first, then the agents dialog; closing drops suggest", async () => {
    nav.search = "tab=config&suggest=1";
    const qc = makeTestQueryClient();
    qc.setQueryData(queryKeys.mergeConflicts("sk1"), [
      {
        convention_id: "c1",
        rule: "Name loaders getX",
        rule_block: "### Name loaders getX",
        existing_excerpt: "",
        reason: "opposite naming",
      },
    ]);
    const spy = mockFetch({
      "GET /skills/sk1": GATE,
      "GET /skills/sk1/agent-suggestions": [
        { agent_id: "a1", agent_name: "Security Reviewer", score: 0.6, preselected: true, reasons: [] },
      ],
    });
    renderWithProviders(<SkillDetailView skillId="sk1" />, qc);

    expect(await screen.findByRole("dialog")).toHaveTextContent("1 merge conflict");
    // Gated, not just slow: the suggestions are not even requested while conflicts are open.
    await screen.findByRole("heading", { level: 1, name: "secret-leakage-gate" });
    await waitFor(() => expect(fetchCalls(spy).map(([, p]) => p)).toContain("/skills/sk1"));
    expect(fetchCalls(spy).map(([, p]) => p)).not.toContain("/skills/sk1/agent-suggestions");
    expect(screen.queryByText("Link this skill to agents")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep all existing" }));
    expect(await screen.findByText("Link this skill to agents")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(nav.replace).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("without ?suggest=1 no suggestions are fetched", async () => {
    nav.search = "tab=config";
    const spy = mockFetch({ "GET /skills/sk1": GATE });
    renderWithProviders(<SkillDetailView skillId="sk1" />);
    await screen.findByRole("heading", { level: 1, name: "secret-leakage-gate" });
    expect(fetchCalls(spy).map(([, p]) => p)).not.toContain("/skills/sk1/agent-suggestions");
  });

  it("says so when the skill does not exist", async () => {
    mockFetch({});
    renderWithProviders(<SkillDetailView skillId="nope" />);
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
  });
});
