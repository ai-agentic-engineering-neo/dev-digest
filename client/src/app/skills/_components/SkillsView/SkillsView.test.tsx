import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const updateMutate = vi.fn();
let skillsData: SkillListItem[] = [];

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: skillsData, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkillVersions: () => ({
    data: [
      { skill_id: "s1", version: 2, body: "# Rule\n\nAssert behaviour.", created_at: "2026-11-20T10:00:00.000Z" },
      { skill_id: "s1", version: 1, body: "# Rule", created_at: "2026-11-19T10:00:00.000Z" },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { SkillsView } from "./SkillsView";

const SKILL = (over: Partial<SkillListItem>): SkillListItem => ({
  id: "s1",
  name: "test-quality-rubric",
  description: "Apply when a PR changes tests",
  type: "rubric",
  source: "manual",
  body: "# Rule\n\nAssert behaviour.",
  enabled: true,
  version: 2,
  agent_count: 3,
  ...over,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  skillsData = [SKILL({}), SKILL({ id: "s2", name: "sql-safety", type: "security", enabled: false, agent_count: 1 })];
  updateMutate.mockClear();
});
afterEach(cleanup);

describe("SkillsView", () => {
  it("renders a card per skill with type badge and agent count", () => {
    renderView();
    expect(screen.getByText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("sql-safety")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
  });

  it("filters by search text", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "sql" } });
    expect(screen.queryByText("test-quality-rubric")).not.toBeInTheDocument();
    expect(screen.getByText("sql-safety")).toBeInTheDocument();
  });

  it("toggle calls update with the new enabled flag and does not open the preview", () => {
    renderView();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } });
    expect(screen.queryByText("Skill body")).not.toBeInTheDocument();
  });

  it("clicking a card opens the side panel with Config, Preview and Versioning tabs", () => {
    renderView();
    expect(screen.queryByRole("region", { name: "test-quality-rubric" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("test-quality-rubric"));
    const panel = screen.getByRole("region", { name: "test-quality-rubric" });
    for (const name of ["Config", "Preview", "Versioning"]) {
      expect(within(panel).getByRole("button", { name })).toBeInTheDocument();
    }
    // Config is the default tab: the editable form, no dialog, no dedicated page link.
    expect(within(panel).getByDisplayValue("test-quality-rubric")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("Preview tab shows the rendered body and the untrusted notice", () => {
    renderView();
    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("Skill body")).toBeInTheDocument();
    expect(screen.getByText("Assert behaviour.")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText(/placed into the prompt of every agent/)).toBeInTheDocument();
  });

  it("Versioning tab lists versions with Diff/Restore on the earlier ones", () => {
    renderView();
    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByRole("button", { name: "Versioning" }));
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore v1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore v2" })).not.toBeInTheDocument();
  });

  it("selecting another card resets the panel to the default tab; close hides it", () => {
    renderView();
    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByText("sql-safety"));
    expect(screen.getByRole("region", { name: "sql-safety" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("sql-safety")).toBeInTheDocument(); // back on Config
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("region", { name: "sql-safety" })).not.toBeInTheDocument();
  });
});
