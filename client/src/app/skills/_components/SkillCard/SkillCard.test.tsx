import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { makeSkill } from "../fixtures";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

function renderCard(skill: Skill) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  const onDelete = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillCard
        skill={skill}
        href="/skills/sk1?tab=config"
        onSelect={onSelect}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect, onToggle, onDelete };
}

describe("SkillCard", () => {
  it("shows the skill, its labels and the agents · version footer; selects on click", () => {
    const { onSelect } = renderCard(makeSkill());
    const link = screen.getByRole("link", { name: "secret-leakage-gate" });
    expect(link).toHaveAttribute("href", "/skills/sk1?tab=config");
    expect(screen.getByText("Block diffs that add credentials")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents · v2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Block diffs that add credentials"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("toggles enabled without selecting the card, and uses the singular footer", () => {
    const { onSelect, onToggle } = renderCard(makeSkill({ enabled: false, agent_count: 1, version: 1 }));
    const toggle = screen.getByRole("switch", { name: "Enabled" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("1 agent · v1")).toBeInTheDocument();
  });

  it("the trash button asks to delete without selecting the card", () => {
    const { onSelect, onDelete } = renderCard(makeSkill());
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
