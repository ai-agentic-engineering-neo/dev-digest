/* StatsTab — metrics once the skill ran, and "Used by" in both states: before
   the first run it is the only place the editor lists the linking agents. */
import { describe, it, expect, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { makeStats } from "@/test/skill-fixtures";
import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const USED_BY = [{ id: "ag1", name: "Security Reviewer", enabled: true }];

describe("StatsTab", () => {
  it("before the first run: the empty state plus the agents that link the skill", async () => {
    mockFetch({ "GET /skills/sk1/stats": makeStats({ runs_attached: 0, used_by: USED_BY }) });
    renderWithProviders(<StatsTab skillId="sk1" />);
    expect(await screen.findByText("No stats yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Security Reviewer" })).toHaveAttribute("href", "/agents/ag1?tab=skills");
  });

  it("after runs: the metrics and Used by", async () => {
    mockFetch({
      "GET /skills/sk1/stats": makeStats({ runs_attached: 4, runs_cited: 2, pull_rate: 0.5, findings: 3, used_by: USED_BY }),
    });
    renderWithProviders(<StatsTab skillId="sk1" />);
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("No stats yet")).toBeNull();
    expect(screen.getByRole("link", { name: "Security Reviewer" })).toBeInTheDocument();
  });

  it("no linking agent → says so", async () => {
    mockFetch({ "GET /skills/sk1/stats": makeStats() });
    renderWithProviders(<StatsTab skillId="sk1" />);
    expect(await screen.findByText("No stats yet")).toBeInTheDocument();
    expect(screen.getByText("Used by")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
