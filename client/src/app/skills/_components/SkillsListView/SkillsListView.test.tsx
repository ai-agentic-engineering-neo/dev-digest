import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Flags weak PR descriptions",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
    evidence_files: null,
    agents_count: 2,
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

// AppShell pulls in the full shell (command palette, shortcuts, repo context)
// — stub it to a passthrough so this stays a focused view smoke test.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView (smoke)", () => {
  it("renders the heading and the skill list", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
  });

  it("filters the list by search text", () => {
    renderWithIntl(<SkillsListView />);
    const input = screen.getByPlaceholderText("Search skills…");
    fireEvent.change(input, { target: { value: "nonexistent" } });
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });

  it("opens the Add Skill dropdown with Create and Import from file options", () => {
    renderWithIntl(<SkillsListView />);
    fireEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Import from file")).toBeInTheDocument();
  });
});
