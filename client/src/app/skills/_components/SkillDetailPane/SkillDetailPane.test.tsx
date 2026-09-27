import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";

const push = vi.fn();
const replace = vi.fn();
let id = "sk-1";
let search = new URLSearchParams("tab=preview");
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useRouter: () => ({ push, replace }),
  useSearchParams: () => search,
}));

const SKILL: Skill = {
  id: "sk-1",
  name: "repo-conventions",
  description: "Flags changes that violate the house conventions.",
  type: "convention",
  source: "extracted",
  body: "# repo-conventions",
  enabled: true,
  version: 1,
  evidence_files: null,
  agent_count: 1,
};
let list: Skill[] = [SKILL];
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
}));

// The detail itself has its own tests; here only what the pane hands it matters.
vi.mock("../SkillDetail", () => ({
  SkillDetail: ({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) => (
    <div>
      <span>detail:{skill.name}</span>
      <span>tab:{tab}</span>
      <button onClick={() => onTab("versions")}>switch tab</button>
    </div>
  ),
}));

import { SkillDetailPane } from "./SkillDetailPane";

function renderPane() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillDetailPane />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
  id = "sk-1";
  search = new URLSearchParams("tab=preview");
  list = [SKILL];
});

describe("SkillDetailPane", () => {
  it("opens the skill from the path on the tab from the query", () => {
    renderPane();
    expect(screen.getByText("detail:repo-conventions")).toBeInTheDocument();
    expect(screen.getByText("tab:preview")).toBeInTheDocument();
  });

  it("keeps the tab in the address when it changes", () => {
    renderPane();
    fireEvent.click(screen.getByRole("button", { name: "switch tab" }));
    expect(replace).toHaveBeenCalledWith("/skills/sk-1?tab=versions");
  });

  it("says the skill is gone instead of rendering an empty pane", () => {
    id = "deleted-elsewhere";
    renderPane();
    expect(screen.getByText("Skill not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /all skills/i }));
    expect(push).toHaveBeenCalledWith("/skills");
  });
});
