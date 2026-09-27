import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";
import { isThirdParty } from "../../helpers";
import { filterSkills } from "@/lib/skills";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Evaluates overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 5,
  evidence_files: null,
  agent_count: 3,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("shows the name, type, source and how many agents load it", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
  });

  it("says 'no agents' rather than '0 agents' when nothing links it", () => {
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: 0 }} />);
    expect(screen.getByText("no agents")).toBeInTheDocument();
  });

  it("marks a disabled imported skill as needing vetting", () => {
    renderCard(<SkillCard skill={{ ...SKILL, source: "community", enabled: false }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
  });

  it("does not nag about vetting once an imported skill is enabled", () => {
    renderCard(<SkillCard skill={{ ...SKILL, source: "community", enabled: true }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("toggling does not also select the card", () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onToggle={onToggle} onClick={onClick} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is reachable and activatable from the keyboard", () => {
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} />);
    const card = screen.getByRole("button", { name: /pr-quality-rubric/ });
    expect(card).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });

  it("falls back to a translated placeholder when the description is empty", () => {
    renderCard(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("skill helpers", () => {
  it("treats only community and imported_url as third-party", () => {
    expect(isThirdParty("community")).toBe(true);
    expect(isThirdParty("imported_url")).toBe(true);
    expect(isThirdParty("manual")).toBe(false);
    expect(isThirdParty("extracted")).toBe(false);
  });

  it("filters on name and description, case-insensitively", () => {
    const other: Skill = { ...SKILL, id: "sk2", name: "mock-overuse-gate", description: "Mocks" };
    expect(filterSkills([SKILL, other], "RUBRIC").map((sk: Skill) => sk.id)).toEqual(["sk1"]);
    expect(filterSkills([SKILL, other], "mocks").map((sk: Skill) => sk.id)).toEqual(["sk2"]);
    expect(filterSkills([SKILL, other], "  ")).toHaveLength(2);
  });
});
