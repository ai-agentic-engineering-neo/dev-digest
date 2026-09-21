import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const deleteMutate = vi.fn();
vi.mock("../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flags weak PR descriptions",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe specific.",
  enabled: true,
  version: 1,
  evidence_files: null,
  agents_count: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type badge and agents_count", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("3 agent(s)")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows the source badge label", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "community" }} />);
    expect(screen.getByText("Community")).toBeInTheDocument();
  });

  it("deletes the skill when the trash icon is clicked and confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(window.confirm).toHaveBeenCalledWith('Delete skill "pr-quality-rubric"? This cannot be undone.');
    expect(deleteMutate).toHaveBeenCalledWith("sk1");
  });

  it("does not delete the skill when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
