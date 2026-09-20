import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentAttachedSkill, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/agents.json";

const SKILLS: Skill[] = [
  {
    id: "s1",
    name: "pr-rubric",
    description: "Rubric for PR quality",
    type: "rubric",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "s2",
    name: "sec-check",
    description: "Security checklist",
    type: "security",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "s3",
    name: "conv-style",
    description: "Style conventions",
    type: "convention",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

const LINKS: AgentAttachedSkill[] = [
  { agent_id: "ag1", skill_id: "s1", order: 0, enabled: true, name: "pr-rubric", description: "Rubric for PR quality", type: "rubric", source: "manual", skill_enabled: true },
  { agent_id: "ag1", skill_id: "s3", order: 1, enabled: false, name: "conv-style", description: "Style conventions", type: "convention", source: "manual", skill_enabled: true },
];

const mutateMock = vi.fn();

vi.mock("@/lib/api/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false }),
}));
vi.mock("@/lib/api/agents", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: mutateMock, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => mutateMock.mockClear());
afterEach(cleanup);

/** What the last mutation sent, reduced to what this tab decides: which skills
    are attached, in which order, and with which per-agent flag. */
function sentLinks() {
  const { links } = mutateMock.mock.calls.at(-1)![0] as {
    links: Array<{ skill_id: string; order: number; enabled: boolean }>;
  };
  return links.map((l) => ({ skill_id: l.skill_id, order: l.order, enabled: l.enabled }));
}

describe("SkillsTab", () => {
  it("renders every workspace skill with the attached-count badge", () => {
    renderWithIntl();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    // s1 is attached and on; s3 is attached but off for this agent, so only one
    // of the three actually reaches the prompt.
    expect(screen.getByText("1 of 3 reach the prompt")).toBeInTheDocument();
    expect(screen.getByText("pr-rubric")).toBeInTheDocument();
    expect(screen.getByText("sec-check")).toBeInTheDocument();
    expect(screen.getByText("conv-style")).toBeInTheDocument();
  });

  it("attaching an unattached skill sends the whole ordered payload, appended last", () => {
    renderWithIntl();
    // Row order is attached-first: pr-rubric, conv-style, then sec-check (unattached).
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[2]!);
    expect(sentLinks()).toEqual([
      { skill_id: "s1", order: 0, enabled: true },
      { skill_id: "s3", order: 1, enabled: false },
      { skill_id: "s2", order: 2, enabled: true },
    ]);
  });

  it("moving the second attached row up swaps it with the first", () => {
    renderWithIntl();
    const moveUpButtons = screen.getAllByRole("button", { name: "Move up" });
    // moveUpButtons[0] belongs to the first attached row (pr-rubric) and is a
    // no-op boundary; moveUpButtons[1] belongs to conv-style.
    fireEvent.click(moveUpButtons[1]!);
    expect(sentLinks()).toEqual([
      { skill_id: "s3", order: 0, enabled: false },
      { skill_id: "s1", order: 1, enabled: true },
    ]);
  });
});
