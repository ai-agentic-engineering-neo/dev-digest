import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import * as hooks from "@/lib/hooks/skills";
import { StatsTab } from "./StatsTab";
import { categorySegments } from "./helpers";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockStats(data: SkillStats) {
  vi.spyOn(hooks, "useSkillStats").mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof hooks.useSkillStats>);
}

describe("StatsTab", () => {
  it("renders '—' for every unmeasured (null) figure on a fresh skill, not 0", () => {
    mockStats({
      used_by: 0,
      agents: [],
      pull_pct: null,
      accept_pct: null,
      findings_30d: 0,
      by_category: [],
      avg_tokens: null,
    });
    renderWithProviders(<StatsTab skill={SKILL} />);

    // USED BY and FINDINGS (30D) are measured zeros → real "0".
    expect(screen.getAllByText("0")).toHaveLength(2);
    // PULL FREQUENCY and ACCEPT RATE are unmeasured → "—", never "0%".
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    expect(screen.getByText("No agent uses this skill yet.")).toBeInTheDocument();
    expect(screen.getByText("No findings recorded in runs that used this skill.")).toBeInTheDocument();
  });

  it("renders measured percentages once the skill has been pulled into real runs", () => {
    mockStats({
      used_by: 3,
      agents: [{ id: "a1", name: "Security Reviewer" }],
      pull_pct: 71,
      accept_pct: 74,
      findings_30d: 96,
      by_category: [
        { category: "security", count: 2 },
        { category: "bug", count: 1 },
      ],
      avg_tokens: 166,
    });
    renderWithProviders(<StatsTab skill={SKILL} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    // The category legend shows plain COUNTS, never a currency-formatted value —
    // the mockup's "security $52.00" was a count run through a money formatter.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("links each agent row to that agent's Skills tab", () => {
    mockStats({
      used_by: 1,
      agents: [{ id: "agent-42", name: "Test Quality Reviewer" }],
      pull_pct: 50,
      accept_pct: 50,
      findings_30d: 3,
      by_category: [{ category: "bug", count: 3 }],
      avg_tokens: 42,
    });
    renderWithProviders(<StatsTab skill={SKILL} />);
    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toHaveAttribute("href", "/agents/agent-42?tab=skills");
  });
});

describe("categorySegments", () => {
  it("converts counts to color + fraction segments that sum to the total", () => {
    const segments = categorySegments([
      { category: "security", count: 3 },
      { category: "bug", count: 1 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ category: "security", count: 3, fraction: 0.75 });
    expect(segments[1]).toMatchObject({ category: "bug", count: 1, fraction: 0.25 });
  });

  it("returns fraction 0 for every segment when the total is 0", () => {
    const segments = categorySegments([{ category: "x", count: 0 }]);
    expect(segments[0]?.fraction).toBe(0);
  });
});
