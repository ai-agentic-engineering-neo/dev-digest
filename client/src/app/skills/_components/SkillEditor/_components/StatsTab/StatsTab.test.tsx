import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const EMPTY: SkillStats = {
  used_by: 0,
  agents: [],
  runs_with_skill: 0,
  runs_by_linked_agents: 0,
  pull_frequency: null,
  findings: 0,
  accepted: 0,
  settled: 0,
  accept_rate: null,
  by_category: [],
  window_days: 30,
};

const POPULATED: SkillStats = {
  used_by: 2,
  agents: [
    { id: "ag1", name: "Test Quality Reviewer" },
    { id: "ag2", name: "Security Sentinel" },
  ],
  runs_with_skill: 18,
  runs_by_linked_agents: 24,
  pull_frequency: 0.75,
  findings: 52,
  accepted: 31,
  settled: 44,
  accept_rate: 0.7,
  by_category: [
    { category: "security", count: 21 },
    { category: "correctness", count: 14 },
  ],
  window_days: 30,
};

let stats: SkillStats = EMPTY;
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  stats = EMPTY;
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "d",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  token_estimate: 10,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("StatsTab", () => {
  it("renders an em dash rather than 0% when a denominator is zero", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("orders the tiles used-by / pull / accept / findings and carries the window in the findings label", () => {
    stats = POPULATED;
    renderWithIntl(<StatsTab skill={SKILL} />);

    const labels = ["Used by", "Pull frequency", "Accept rate", "Findings (30d)"];
    const rendered = labels.map((l) => screen.getByText(l));
    rendered.forEach((el) => expect(el).toBeInTheDocument());
    // Document order must match the design's reading order.
    for (let i = 1; i < rendered.length; i++) {
      const previous = rendered[i - 1]!;
      expect(previous.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // The standalone "Last 30 days" banner is gone …
    expect(screen.queryByText(/Last 30 days/)).not.toBeInTheDocument();
    // … and so are the caption lines under each tile — the hint is a tooltip now.
    expect(screen.queryByText("Agents currently linking this skill.")).not.toBeInTheDocument();
    expect(screen.getByTitle("Agents currently linking this skill.")).toBeInTheDocument();
  });

  it("lists each linked agent as its own row that opens the agent", () => {
    stats = POPULATED;
    renderWithIntl(<StatsTab skill={SKILL} />);

    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/agents/ag1?tab=config");
    expect(within(rows[0]!).getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Open")).toBeInTheDocument();
  });

  it("keeps the category legend a plain count — a category is not money (§7.2)", () => {
    stats = POPULATED;
    const { container } = renderWithIntl(<StatsTab skill={SKILL} />);

    expect(screen.getByText("security")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\$/);
  });
});
