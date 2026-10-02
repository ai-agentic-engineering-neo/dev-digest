import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillRailCard } from "./SkillRailCard";

afterEach(cleanup);

const SKILL: SkillWithStats = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 1,
  evidence_files: null,
  stats: { used_by: 3, pull_pct: 71, accept_pct: 74 },
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillRailCard", () => {
  it("renders the name, type/source badges and the full stats footer", () => {
    renderWithIntl(<SkillRailCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71% pull")).toBeInTheDocument();
    expect(screen.getByText("74% accept")).toBeInTheDocument();
  });

  it("collapses the footer to just the agent count when nothing has been measured yet", () => {
    const unused: SkillWithStats = {
      ...SKILL,
      stats: { used_by: 0, pull_pct: null, accept_pct: null },
    };
    renderWithIntl(<SkillRailCard skill={unused} />);
    expect(screen.getByText("0 agents")).toBeInTheDocument();
    // An unused skill must not print a misleading "0% pull" or "0% accept" —
    // that would read identically to a skill that was actually rejected.
    expect(screen.queryByText(/% pull/)).not.toBeInTheDocument();
    expect(screen.queryByText(/% accept/)).not.toBeInTheDocument();
  });

  it("shows a 'needs vetting' badge for an imported, not-yet-enabled skill", () => {
    const imported: SkillWithStats = { ...SKILL, source: "imported_url", enabled: false };
    renderWithIntl(<SkillRailCard skill={imported} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not show the vetting badge once the imported skill is enabled", () => {
    const vetted: SkillWithStats = { ...SKILL, source: "imported_url", enabled: true };
    renderWithIntl(<SkillRailCard skill={vetted} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("fires onClick when the card is clicked, and onToggle without bubbling into it", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillRailCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);

    screen.getByRole("switch").click();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();

    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
