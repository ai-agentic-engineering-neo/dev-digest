import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed", cost_usd: 0.06 },
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

// Per-test trace (the mock factory reads it lazily at render time).
let TRACE: RunTrace = BASE_TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  TRACE = BASE_TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("$0.0600")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Run Trace drawer — Skills block token badge (crit. 19/20)", () => {
  const SKILLS_TEXT = "S".repeat(40);

  function openPromptAssembly() {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // "Prompt assembly" is collapsed by default.
    fireEvent.click(screen.getByText("Prompt assembly"));
  }

  it("shows the server-side skills_tokens next to the Skills (dynamic) label", () => {
    TRACE = {
      ...BASE_TRACE,
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, skills: SKILLS_TEXT },
      // Deliberately different from ceil(40/4)=10 so the server value is proven to win.
      prompt_assembly_meta: { skills_tokens: 7 },
    };
    openPromptAssembly();
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.getByText("~7 tokens")).toBeInTheDocument();
  });

  it("falls back to ceil(length/4) for old traces without prompt_assembly_meta", () => {
    TRACE = { ...BASE_TRACE, prompt_assembly: { ...BASE_TRACE.prompt_assembly, skills: SKILLS_TEXT } };
    expect(TRACE.prompt_assembly_meta).toBeUndefined();
    openPromptAssembly();
    expect(screen.getByText("~10 tokens")).toBeInTheDocument();
  });

  it("renders neither the Skills block nor a badge when the run had no skills block", () => {
    TRACE = {
      ...BASE_TRACE,
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, skills: null },
      prompt_assembly_meta: { skills_tokens: null },
    };
    openPromptAssembly();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens$/)).not.toBeInTheDocument();
  });
});
