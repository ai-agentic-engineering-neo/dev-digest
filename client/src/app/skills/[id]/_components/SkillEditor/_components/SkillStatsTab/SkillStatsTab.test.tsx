import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { renderWithProviders, mockFetch } from "../../../../../_test/harness";
import { SkillStatsTab } from "./SkillStatsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillStatsTab", () => {
  it("renders the tiles, agents list with Open links, and category legend", async () => {
    mockFetch({
      "GET /skills/s1/stats": {
        used_by: 3,
        pull_rate: 71,
        accept_rate: 74,
        findings_30d: 96,
        agents_using: [{ id: "a1", name: "Security Reviewer" }],
        findings_by_category: [
          { category: "security", cost_usd: 52 },
          { category: "bug", cost_usd: 20.5 },
        ],
      },
    });
    renderWithProviders(<SkillStatsTab skillId="s1" />);

    expect(await screen.findByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText("PULL FREQUENCY")).toBeInTheDocument();
    expect(screen.getByText("FINDINGS (30D)")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getAllByText("74").length).toBeGreaterThan(0); // tile value + ring

    const open = screen.getByRole("link", { name: "Open agent Security Reviewer" });
    expect(open).toHaveAttribute("href", "/agents/a1?tab=skills");
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();

    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("$52.00")).toBeInTheDocument();
    expect(screen.getByText("$20.50")).toBeInTheDocument();
  });

  it("shows dashes for null rates and empty states when there is no data yet", async () => {
    mockFetch({
      "GET /skills/s1/stats": {
        used_by: 0,
        pull_rate: null,
        accept_rate: null,
        findings_30d: 0,
        agents_using: [],
        findings_by_category: [],
      },
    });
    renderWithProviders(<SkillStatsTab skillId="s1" />);

    const pullTile = (await screen.findByText("PULL FREQUENCY")).parentElement!.parentElement!;
    expect(within(pullTile).getByText("—")).toBeInTheDocument();
    const acceptTile = screen.getByText("ACCEPT RATE").parentElement!.parentElement!;
    expect(within(acceptTile).getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/No agents use this skill yet/)).toBeInTheDocument();
    expect(screen.getByText(/No findings yet/)).toBeInTheDocument();
  });
});
