import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Checks PR title and description quality",
    type: "rubric",
    source: "manual",
    body: "# Rule\nBe clear.",
    enabled: true,
    version: 1,
    evidence_files: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

// Mock the data hooks so the view renders without a network/query client.
vi.mock("@/lib/api/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkill: () => ({ data: undefined, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsView } from "./SkillsView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsView (smoke)", () => {
  it("renders the skill list and a select-a-skill prompt when nothing is selected", () => {
    renderWithIntl(<SkillsView />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });
});
