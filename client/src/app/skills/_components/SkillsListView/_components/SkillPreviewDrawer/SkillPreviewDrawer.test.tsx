import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let skillState: { data: Skill | undefined; isLoading: boolean; isError: boolean; refetch: () => void };
const refetch = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkill: () => skillState,
}));

import { SkillPreviewDrawer } from "./SkillPreviewDrawer";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Scores a diff against the team's quality bar",
  type: "rubric",
  source: "imported_url",
  body: "# Be thorough\nCheck every edge case.",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderWithIntl(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillPreviewDrawer skillId="sk1" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe("SkillPreviewDrawer", () => {
  it("shows an error state with retry when the skill fails to load", () => {
    skillState = { data: undefined, isLoading: false, isError: true, refetch };
    renderWithIntl();
    expect(screen.getByText("Could not load this skill.")).toBeInTheDocument();
  });

  it("renders the skill's name, type, source badge and markdown body", () => {
    skillState = { data: SKILL, isLoading: false, isError: false, refetch };
    renderWithIntl();
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("Be thorough")).toBeInTheDocument();
  });

  it("the Edit button navigates to the full editor route", () => {
    skillState = { data: SKILL, isLoading: false, isError: false, refetch };
    renderWithIntl();
    fireEvent.click(screen.getByText("Edit"));
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });

  it("the close button calls onClose", () => {
    skillState = { data: SKILL, isLoading: false, isError: false, refetch };
    const onClose = vi.fn();
    renderWithIntl(onClose);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
