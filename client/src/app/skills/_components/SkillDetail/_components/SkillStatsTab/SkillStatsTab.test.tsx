import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import type { SkillStats } from "@devdigest/shared";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";
import { SkillStatsTab } from "./SkillStatsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FULL: SkillStats = {
  skill_id: "s1",
  agents_count: 3,
  pull_rate: 0.7449,
  accept_rate: 0.612,
  window_days: 30,
  runs_total: 10,
  runs_pulled: 7,
  findings_total: 96,
  findings_accepted: 40,
  findings_dismissed: 14,
  agents: [
    { id: "a1", name: "Security Reviewer", enabled: true },
    { id: "a2", name: "Performance Reviewer", enabled: false },
  ],
  by_category: [
    { category: "security", count: 52 },
    { category: "bug", count: 20 },
    { category: "perf", count: 16 },
    { category: "style", count: 8 },
  ],
};

const setup = (data: unknown) => {
  const calls = mockFetch({ "GET /skills/s1/stats": data });
  renderWithProviders(<SkillStatsTab skillId="s1" />);
  return calls;
};

describe("SkillStatsTab", () => {
  it("renders tiles for full stats with rounded percents", async () => {
    setup(FULL);
    expect(await screen.findByText("USED BY", { exact: false })).toBeTruthy();
    expect(screen.getByText("agents")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy(); // 0.7449 -> 74
    expect(screen.getByText("96")).toBeTruthy();
    expect(screen.getByText(/Findings \(30d\)/i)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Accept rate 61%" })).toBeTruthy();
  });

  it("renders a dash for null rates", async () => {
    setup({ ...FULL, pull_rate: null, accept_rate: null });
    await screen.findByText(/Pull frequency/i);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: /Accept rate/ })).toBeNull();
  });

  it("lists agents with Open links and an off badge", async () => {
    setup(FULL);
    const link1 = await screen.findByRole("link", { name: "Open Security Reviewer" });
    expect(link1.getAttribute("href")).toBe("/agents/a1?tab=skills");
    const link2 = screen.getByRole("link", { name: "Open Performance Reviewer" });
    expect(link2.getAttribute("href")).toBe("/agents/a2?tab=skills");
    expect(screen.getAllByText("off")).toHaveLength(1);
    const row2 = link2.closest("li")!;
    expect(within(row2).getByText("off")).toBeTruthy();
  });

  it("renders donut label and legend counts", async () => {
    setup(FULL);
    const chart = await screen.findByRole("img", { name: /Findings by category/ });
    expect(chart.getAttribute("aria-label")).toBe("Findings by category: security 52, bug 20, perf 16, style 8");
    const legend = screen.getByText("security").closest("ul")!;
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4);
    expect(within(legend).getByText("52")).toBeTruthy();
  });

  it("buckets categories beyond six into other", async () => {
    const by_category = Array.from({ length: 8 }, (_, i) => ({ category: `c${i}`, count: 10 - i }));
    setup({ ...FULL, by_category });
    const chart = await screen.findByRole("img", { name: /Findings by category/ });
    expect(chart.getAttribute("aria-label")).toContain("other 7");
    expect(screen.getByText("other")).toBeTruthy();
    expect(screen.queryByText("c7")).toBeNull();
  });

  it("shows the empty state when there are no runs", async () => {
    setup({ ...FULL, runs_total: 0 });
    expect(await screen.findByText("No stats yet")).toBeTruthy();
    expect(screen.getByText(/last 30 days/)).toBeTruthy();
  });

  it("shows skeletons while loading", () => {
    mockFetch({ "GET /skills/s1/stats": new Promise(() => {}) as unknown });
    renderWithProviders(<SkillStatsTab skillId="s1" />);
    expect(screen.getByTestId("skill-stats-loading")).toBeTruthy();
  });

  it("shows an error and retry refetches", async () => {
    const calls = mockFetch({});
    renderWithProviders(<SkillStatsTab skillId="s1" />);
    expect(await screen.findByText("Couldn't load stats")).toBeTruthy();
    const before = calls.length;
    await userEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
  });
});
