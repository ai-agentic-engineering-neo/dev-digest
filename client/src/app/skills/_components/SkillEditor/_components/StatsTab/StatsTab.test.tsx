import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

let stats: SkillStats;
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="s1" />
    </NextIntlClientProvider>,
  );

describe("StatsTab", () => {
  it("shows — and empty states when the skill has no runs yet", () => {
    stats = { used_by: [], pull_rate: null, accept_rate: null, findings_30d: 0, by_category: [] };
    renderTab();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No agent has this skill enabled yet.")).toBeInTheDocument();
    expect(screen.getByText(/No findings from runs/)).toBeInTheDocument();
  });

  it("shows rates, the agents using it and the correlation note", () => {
    stats = {
      used_by: [{ agent_id: "a1", name: "Test Quality Reviewer" }],
      pull_rate: 0.71,
      accept_rate: 0.74,
      findings_30d: 96,
      by_category: [{ category: "test", count: 60 }],
    };
    renderTab();
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(screen.getByText(/Correlated, not causal/)).toBeInTheDocument();
  });
});
