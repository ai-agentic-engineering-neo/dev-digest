import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Scores a diff against the team's quality bar",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe thorough.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, description and type badge", () => {
    renderWithIntl(<SkillCard sk={SKILL} />);
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("Scores a diff against the team's quality bar")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
  });

  it("does not show a source badge for a manual skill", () => {
    renderWithIntl(<SkillCard sk={SKILL} />);
    expect(screen.queryByText("Imported")).not.toBeInTheDocument();
  });

  it("shows a source badge when the skill was imported", () => {
    renderWithIntl(<SkillCard sk={{ ...SKILL, source: "imported_url" }} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
  });

  it("toggling enabled calls onToggle without bubbling into the card's onClick", () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderWithIntl(<SkillCard sk={SKILL} onToggle={onToggle} onClick={onClick} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});
