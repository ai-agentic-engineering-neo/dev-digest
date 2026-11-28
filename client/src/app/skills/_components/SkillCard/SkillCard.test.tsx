import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 5,
  agent_count: 3,
};

describe("SkillCard", () => {
  it("shows the agent count and no pull or accept figures", () => {
    renderWithProviders(<SkillCard skill={SKILL} href="/skills/sk1?tab=config" onToggle={() => {}} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.queryByText(/pull|accept/i)).not.toBeInTheDocument();
  });

  it("toggles without opening the skill; a click elsewhere opens it", () => {
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onToggle = vi.fn();
    renderWithProviders(<SkillCard skill={SKILL} href="/skills/sk1?tab=config" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch", { name: "Enable pr-quality-rubric" }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(linkClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("3 agents"));
    expect(linkClick).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled skill's switch off, and turning it on asks to enable", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <SkillCard skill={{ ...SKILL, enabled: false, agent_count: 1 }} href="/skills/sk1" onToggle={onToggle} />,
    );
    const toggle = screen.getByRole("switch", { name: "Enable pr-quality-rubric" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
