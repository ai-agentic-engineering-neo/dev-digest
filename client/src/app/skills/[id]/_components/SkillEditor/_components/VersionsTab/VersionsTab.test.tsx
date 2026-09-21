import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "# Rule v2", change_note: "Tightened wording", created_at: "2026-09-19T10:00:00.000Z" },
  { skill_id: "sk1", version: 1, body: "# Rule v1", change_note: null, created_at: "2026-09-01T10:00:00.000Z" },
];

const restoreMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rule v2",
  enabled: true,
  version: 2,
  evidence_files: null,
  agents_count: 0,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("Skill Editor VersionsTab (smoke)", () => {
  it("renders newest-first rows with change notes and a placeholder dash when absent", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Tightened wording")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marks the current version and only offers Diff/Restore on earlier ones", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getAllByText("Restore")).toHaveLength(1);
    expect(screen.getAllByText("Diff")).toHaveLength(1);
  });

  it("calls useRestoreSkillVersion with the row's version on Restore", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Restore"));
    expect(restoreMutate).toHaveBeenCalledWith(1);
  });

  it("opens a plain old-vs-current diff modal on Diff", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Diff"));
    expect(screen.getByText("# Rule v1")).toBeInTheDocument();
    expect(screen.getByText("# Rule v2")).toBeInTheDocument();
  });
});
