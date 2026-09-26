/**
 * SkillsListView — a search matching no skill must show a distinct "no
 * match" line, not the zero-skills empty state (WP3 / frontend-react-2-2).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const state = vi.hoisted(() => ({ skills: [] as Skill[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: state.skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

function skill(o: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    description: "",
    type: "rubric",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    ...o,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("SkillsListView — empty vs no-match", () => {
  it("shows a no-match line, not the empty state, when a search matches no loaded skill", () => {
    state.skills = [skill({ id: "s1", name: "pr-quality-rubric" })];
    renderView();

    fireEvent.change(screen.getByPlaceholderText("Search skills…"), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No skills match “does-not-exist”.")).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are zero skills", () => {
    state.skills = [];
    renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });
});
