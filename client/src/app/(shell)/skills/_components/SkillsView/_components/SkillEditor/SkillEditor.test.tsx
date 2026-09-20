import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/api/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
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
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Skill Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
