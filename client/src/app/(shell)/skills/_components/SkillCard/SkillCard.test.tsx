import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

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
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type chip and source label", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows a needs-vetting badge for a non-manual source", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "community" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });
});
