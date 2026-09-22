import { describe, it, expect, afterEach } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { RunTrace } from "@devdigest/shared";

const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

import { RunTraceDrawer } from "./RunTraceDrawer";

afterEach(cleanup);

/** A finished run's drawer: the persisted trace comes from GET /runs/r1/trace. */
function renderDrawer(trace: RunTrace = TRACE) {
  const api = mockFetch({ "GET /runs/r1/trace": trace });
  const view = renderWithProviders(
    <div data-theme="dark">
      <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />
    </div>,
  );
  return { ...view, api };
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", async () => {
    const { api } = renderDrawer();
    expect(await screen.findByText("Configuration")).toBeInTheDocument();
    expect(api.requests("GET", "/runs/r1/trace")).toHaveLength(1);
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows the run cost between TOKENS and FINDINGS", async () => {
    renderDrawer();
    expect(await screen.findByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("an old trace without cost_usd shows a dash", async () => {
    const { cost_usd: _drop, ...oldStats } = TRACE.stats;
    renderDrawer({ ...TRACE, stats: oldStats });
    expect(await screen.findByText("COST")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a failed run shows the usage it spent before the error", async () => {
    renderDrawer({
      ...TRACE,
      stats: { duration_ms: 900, tokens_in: 4200, tokens_out: 10, cost_usd: 0.011, findings: 0, grounding: "0/0 passed" },
    });
    expect(await screen.findByText("4k→0.0k")).toBeInTheDocument();
    expect(screen.getByText("$0.011")).toBeInTheDocument();
  });

  it("switches to the live log tab", async () => {
    const { user } = renderDrawer();
    await user.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Run Trace drawer — accessible sections", () => {
  it("section headers, prompt blocks and tool calls are keyboard toggles", async () => {
    const { user } = renderDrawer();
    const config = await screen.findByRole("button", { name: /Configuration/ });
    expect(config).toHaveAttribute("aria-expanded", "true");
    config.focus();
    await user.keyboard("{Enter}");
    expect(config).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Memory pulled")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Prompt assembly/ }));
    const system = screen.getByRole("button", { name: "System" });
    expect(system).toHaveAttribute("aria-expanded", "false");
    system.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("You are a reviewer.")).toBeInTheDocument();

    const tool = screen.getByRole("button", { name: /review_file/ });
    await user.click(tool);
    expect(tool).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/single-pass \(preview truncated\)/)).toBeInTheDocument();
  });
});

