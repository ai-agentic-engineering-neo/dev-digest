import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./_components/SkillPreviewDrawer", () => ({
  SkillPreviewDrawer: ({ skillId, onClose }: { skillId: string; onClose: () => void }) => (
    <div data-testid="preview-drawer" onClick={onClose}>
      preview:{skillId}
    </div>
  ),
}));

const update = vi.fn();
let skillsState: { data: Skill[] | undefined; isLoading: boolean; isError: boolean };
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => skillsState,
  useUpdateSkill: () => ({ mutate: update }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

function skill(o: Partial<Skill>): Skill {
  return {
    id: "sk1",
    name: "PR Quality Rubric",
    description: "Scores a diff against the team's quality bar",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
    evidence_files: null,
    ...o,
  };
}

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("renders a card per skill", () => {
    skillsState = { data: [skill({}), skill({ id: "sk2", name: "Security Baseline", type: "security" })], isLoading: false, isError: false };
    renderWithIntl();
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("Security Baseline")).toBeInTheDocument();
  });

  it("shows the empty state when there are no skills", () => {
    skillsState = { data: [], isLoading: false, isError: false };
    renderWithIntl();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("shows an error state on load failure", () => {
    skillsState = { data: undefined, isLoading: false, isError: true };
    renderWithIntl();
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
  });

  it("clicking a card opens the preview drawer for that skill", () => {
    skillsState = { data: [skill({})], isLoading: false, isError: false };
    renderWithIntl();
    fireEvent.click(screen.getByText("PR Quality Rubric"));
    expect(screen.getByTestId("preview-drawer")).toHaveTextContent("preview:sk1");
  });

  it("toggling a card's switch updates the skill without opening the drawer", () => {
    skillsState = { data: [skill({})], isLoading: false, isError: false };
    renderWithIntl();
    fireEvent.click(screen.getByRole("switch"));
    expect(update).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(screen.queryByTestId("preview-drawer")).not.toBeInTheDocument();
  });

  it("the Add dropdown offers Create new and Import, each navigating to the entry-point route", () => {
    skillsState = { data: [], isLoading: false, isError: false };
    renderWithIntl();
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create new"));
    expect(push).toHaveBeenCalledWith("/skills/new");

    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Import"));
    expect(push).toHaveBeenCalledWith("/skills/new?import=1");
  });
});
