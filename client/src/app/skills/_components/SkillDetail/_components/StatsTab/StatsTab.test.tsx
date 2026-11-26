import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { StatsTab } from "./StatsTab";

const NOW = new Date("2026-11-26T12:00:00Z");

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flags leaked secrets",
  type: "security",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
  evidence_files: null,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
  agent_count: 3,
};

const STATS: SkillStats = {
  agent_count: 3,
  enabled_agent_count: 2,
  version_count: 5,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
  agents: [
    { agent_id: "ag1", agent_name: "Security Reviewer", enabled: true, runs_30d: 12, findings_30d: 30, accept_rate_30d: 0.75 },
    { agent_id: "ag2", agent_name: "Style Reviewer", enabled: false, runs_30d: 1, findings_30d: 1, accept_rate_30d: null },
  ],
};

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }} now={NOW} timeZone="UTC">
        <StatsTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StatsTab", () => {
  it("shows the four metrics and each agent's own 30-day activity with an Open link", async () => {
    const fetchMock = mockFetch({ status: 200, body: STATS });
    renderTab();

    expect(screen.getByLabelText("Loading stats…")).toBeInTheDocument();
    expect(await screen.findByText("3 agents")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/skills\/sk1\/stats$/);
    expect(screen.getByText("2 enabled")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2 days ago")).toHaveAttribute("title", "2026-11-24");
    expect(screen.getByText("2026-10-01")).toBeInTheDocument();
    expect(screen.getByText("Agent activity, last 30 days")).toBeInTheDocument();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const security = rowOf("Security Reviewer");
    const style = rowOf("Style Reviewer");
    expect(within(security).getByText(/12 runs · 30 findings/)).toBeInTheDocument();
    expect(within(security).getByText("75% accept")).toBeInTheDocument();
    expect(within(security).queryByText("disabled")).not.toBeInTheDocument();
    expect(within(security).getByRole("link", { name: "Open Security Reviewer" })).toHaveAttribute(
      "href",
      "/agents/ag1?tab=skills",
    );

    expect(within(style).getByText("disabled")).toBeInTheDocument();
    expect(within(style).getByText(/1 run · 1 finding/)).toBeInTheDocument();
    expect(within(style).getByText("— accept")).toBeInTheDocument();
  });

  it("shows the empty state when no agent uses the skill", async () => {
    mockFetch({ status: 200, body: { ...STATS, agent_count: 0, enabled_agent_count: 0, agents: [] } });
    renderTab();

    expect(await screen.findByText("Not used by any agent")).toBeInTheDocument();
    expect(screen.getByText("Attach it from an agent's Skills tab.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows an error with Retry that refetches", async () => {
    const fetchMock = mockFetch(
      { status: 500, body: { error: { code: "internal", message: "boom" } } },
      { status: 200, body: STATS },
    );
    renderTab();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load stats.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("3 agents")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
