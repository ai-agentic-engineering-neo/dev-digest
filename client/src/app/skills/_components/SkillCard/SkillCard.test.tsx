import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 5,
  stats: { agents_count: 3, pull_rate: 0.71, accept_rate: 0.74 },
};

const renderIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("SkillCard", () => {
  it("shows name, type, source and the usage line", () => {
    renderIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71% pull")).toBeInTheDocument();
    expect(screen.getByText("74% accept")).toBeInTheDocument();
  });

  it("renders — when there is no usage data and marks imported skills", () => {
    renderIntl(<SkillCard skill={{ ...SKILL, source: "imported_file", stats: null }} />);
    expect(screen.getByText("no agents")).toBeInTheDocument();
    expect(screen.getByText("— pull")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
  });

  it("toggling does not open the card", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderIntl(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});
