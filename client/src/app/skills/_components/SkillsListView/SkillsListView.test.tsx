import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const SKILL_A: Skill = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Uncovered branches",
  description: "Flag new production paths with no asserting test.",
  type: "custom",
  source: "manual",
  body: "# Uncovered branches",
  enabled: true,
  version: 1,
};

const SKILL_B: Skill = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Flaky tests",
  description: "Catch sleep and retry loops.",
  type: "custom",
  source: "manual",
  body: "# Flaky tests",
  enabled: true,
  version: 1,
};

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Uncovered branches",
        description: "Flag new production paths with no asserting test.",
        type: "custom",
        source: "manual",
        body: "# Uncovered branches",
        enabled: true,
        version: 1,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Flaky tests",
        description: "Catch sleep and retry loops.",
        type: "custom",
        source: "manual",
        body: "# Flaky tests",
        enabled: true,
        version: 1,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewSkillImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmSkillImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillsListView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("renders cards from mocked GET /skills", () => {
    renderList();
    expect(screen.getByText(SKILL_A.name)).toBeInTheDocument();
    expect(screen.getByText(SKILL_B.name)).toBeInTheDocument();
  });

  it("search filters by name and description", () => {
    renderList();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "flaky" } });
    expect(screen.queryByText(SKILL_A.name)).not.toBeInTheDocument();
    expect(screen.getByText(SKILL_B.name)).toBeInTheDocument();
  });

  it("Add Skill menu shows Create and Import from file, not URL or Community", () => {
    renderList();
    fireEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Import from file")).toBeInTheDocument();
    expect(screen.queryByText("Import from URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Search community skills…")).not.toBeInTheDocument();
  });

  it("clicking a card opens the skill editor", () => {
    nav.push.mockReset();
    renderList();
    fireEvent.click(screen.getByText(SKILL_A.name));
    expect(nav.push).toHaveBeenCalledWith(`/skills/${SKILL_A.id}?tab=config`);
  });
});
