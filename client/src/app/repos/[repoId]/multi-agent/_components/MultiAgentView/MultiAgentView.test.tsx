import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Agent, ReviewRecord, RunSummary } from "@devdigest/shared";
import { createQueryClient } from "@/lib/query-client";
import { api, ApiError } from "@/lib/api";
import runsMessages from "../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../messages/en/prReview.json";

let currentSearch = "";
const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  useRouter: () => ({ push, replace }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

import { MultiAgentView } from "./MultiAgentView";

const agents = ["a", "b", "c"].map((id) => ({
  id,
  name: `Agent ${id.toUpperCase()}`,
  description: "d",
  model: "m",
  enabled: true,
})) as Agent[];
const pulls = [{ id: "pr1", number: 5, title: "Fix auth" }];

function doneRun(agentId: string): RunSummary {
  return {
    run_id: `run-${agentId}`,
    agent_id: agentId,
    agent_name: agentId,
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: 0,
    grounding: null,
    ran_at: "2026-01-01T00:00:00Z",
    score: 80,
    blockers: null,
  };
}
function reviewFor(agentId: string): ReviewRecord {
  return {
    id: `rv-${agentId}`,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: `run-${agentId}`,
    kind: "review",
    verdict: null,
    summary: null,
    score: 80,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
  };
}

let runs: RunSummary[] = [];
let reviews: ReviewRecord[] = [];
const pending = new Map<string, Array<{ resolve: () => void; reject: (e: Error) => void }>>();

beforeEach(() => {
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} onmessage = null; onerror = null; });
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === "/agents") return agents;
    if (path === "/agents/run-estimates") return { estimates: [] };
    if (path === "/repos/r1/pulls") return pulls;
    if (path === "/pulls/pr1/runs") return runs;
    if (path === "/pulls/pr1/reviews") return reviews;
    return [];
  });
  vi.mocked(api.post).mockImplementation((_path: string, body?: unknown) => {
    const { agentId } = body as { agentId: string };
    return new Promise((resolve, reject) => {
      const list = pending.get(agentId) ?? [];
      list.push({
        resolve: () => resolve({ pr_id: "pr1", runs: [{ agent_id: agentId, run_id: `run-${agentId}` }], reviews: [] }),
        reject,
      });
      pending.set(agentId, list);
    });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  push.mockClear();
  replace.mockClear();
  pending.clear();
  runs = [];
  reviews = [];
  currentSearch = "";
});

function ui() {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
        <MultiAgentView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("MultiAgentView", () => {
  it("renders the results phase in tabs view with only the known agents from the URL", async () => {
    runs = [doneRun("a"), doneRun("b")];
    reviews = [reviewFor("a"), reviewFor("b")];
    currentSearch = "pr=5&agents=a,b,zzz&phase=results&view=tabs";
    render(ui());

    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("Agent A");
    expect(tabs[1]).toHaveTextContent("Agent B");
  });

  it("a results URL shows a skeleton, not the config screen, while pull requests load", async () => {
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/repos/r1/pulls" ? new Promise(() => {}) : base(path),
    );
    currentSearch = "pr=5&agents=a,b&phase=results";
    const { container } = render(ui());

    await vi.waitFor(() => expect(container.querySelector(".skeleton")).not.toBeNull());
    expect(screen.queryByRole("heading", { name: "Run a Multi-Agent Review" })).toBeNull();
    expect(screen.queryByText("Pick a pull request first")).toBeNull();
  });

  it("a results URL shows an error with Retry when pull requests fail to load, then the results", async () => {
    runs = [doneRun("a"), doneRun("b")];
    reviews = [reviewFor("a"), reviewFor("b")];
    const base = vi.mocked(api.get).getMockImplementation()!;
    let pullsFail = true;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/repos/r1/pulls" && pullsFail ? Promise.reject(new ApiError("boom", 500)) : base(path),
    );
    currentSearch = "pr=5&agents=a,b&phase=results&view=tabs";
    render(ui());

    // retry: 1 in the app QueryClient → the error surfaces after one retry delay.
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(within(alert).getByText("Couldn’t load pull requests")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Run a Multi-Agent Review" })).toBeNull();

    pullsFail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
  });

  it("a results URL shows a skeleton, not the 'no run yet' state, while agents load", async () => {
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/agents" ? new Promise(() => {}) : base(path),
    );
    currentSearch = "pr=5&agents=a,b&phase=results";
    const { container } = render(ui());

    // Let every request that does resolve (pulls, and runs/reviews if results mounted) settle first —
    // otherwise the results' own loading skeleton would pass this test before the empty state appears.
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith("/repos/r1/pulls"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container.querySelector(".skeleton")).not.toBeNull();
    expect(screen.queryByText("No runs for these agents yet")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Run a Multi-Agent Review" })).toBeNull();
  });

  it("a results URL shows an error with Retry when agents fail to load, then the results", async () => {
    runs = [doneRun("a"), doneRun("b")];
    reviews = [reviewFor("a"), reviewFor("b")];
    const base = vi.mocked(api.get).getMockImplementation()!;
    let agentsFail = true;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/agents" && agentsFail ? Promise.reject(new ApiError("boom", 500)) : base(path),
    );
    currentSearch = "pr=5&agents=a,b&phase=results&view=tabs";
    render(ui());

    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(within(alert).getByText("Couldn’t load agents")).toBeInTheDocument();
    expect(screen.queryByText("No runs for these agents yet")).toBeNull();

    agentsFail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
  });

  it("without a PR asks to pick one and disables Run", async () => {
    render(ui());
    expect(await screen.findByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run \d+ agent|Run multi-agent|Select agents/ })).toBeDisabled();
  });

  it("starts all agents at once, shows a per-column start failure, retries one agent, and configures again", async () => {
    currentSearch = "pr=5&agents=a,b,c";
    const view = render(ui());

    const run = await screen.findByRole("button", { name: "Run multi-agent review (3)" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);

    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.post).mock.calls.map((c) => c[1])).toEqual([
      { agentId: "a" },
      { agentId: "b" },
      { agentId: "c" },
    ]);
    const pushed = String(push.mock.calls[0]?.[0]);
    expect(pushed).toContain("phase=results");
    expect(pushed).toContain("pr=5");

    currentSearch = "pr=5&agents=a,b,c&phase=results";
    view.rerender(ui());

    await act(async () => {
      pending.get("a")?.[0]?.resolve();
      pending.get("c")?.[0]?.resolve();
      pending.get("b")?.[0]?.reject(new ApiError("429 Too Many Requests", 429));
    });

    expect(await screen.findByText("Failed to start")).toBeInTheDocument();
    expect(screen.getByText("429 Too Many Requests")).toBeInTheDocument();
    // The other agents' columns are unaffected by b's failure.
    expect(screen.getAllByText("Failed to start")).toHaveLength(1);
    expect(screen.getByText("Agent A")).toBeInTheDocument();
    expect(screen.getByText("Agent B")).toBeInTheDocument();
    expect(screen.getByText("Agent C")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(4));
    expect(vi.mocked(api.post).mock.calls[3]?.[1]).toEqual({ agentId: "b" });

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    const configured = String(push.mock.calls.at(-1)?.[0]);
    expect(configured).toContain("pr=5");
    expect(configured).toContain("agents=a,b,c");
    expect(configured).not.toContain("phase");
  });
});
