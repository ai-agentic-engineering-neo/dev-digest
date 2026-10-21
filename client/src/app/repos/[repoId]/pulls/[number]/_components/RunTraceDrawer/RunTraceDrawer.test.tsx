import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: "### skill",
    memory: null,
    specs: null,
    intent: "Adds rate limiting.",
    intent_confidence: "medium",
    user: "Review PR #482",
  },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// the trace the mocked hook serves; a test swaps it
const served: { trace: RunTrace } = { trace: TRACE };

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: served.trace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  served.trace = TRACE;
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
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    // Run cost badge (L01): the COST stat sits next to TOKENS.
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("shows the PR intent block with its confidence in the prompt assembly", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("PR intent (dynamic) · medium confidence")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows the project context block and one sub-block per document (AC-42, AC-43)", () => {
    served.trace = {
      ...TRACE,
      prompt_assembly: {
        ...TRACE.prompt_assembly,
        specs: '<untrusted source="docs/a.md">\nA text\n</untrusted>',
        context_tokens: 30,
        context_blocks: [
          { path: "docs/a.md", tokens: 10, text: "A text", truncated: false, source: "agent" },
          { path: "specs/b.md", tokens: 20, text: "B text", truncated: true, source: "skill:secret-gate", modified: true },
          { path: "docs/c.md", tokens: 5, text: "C text", truncated: false, source: "agent", modified: false },
          { path: "docs/d.md", tokens: 6, text: "D text", truncated: false, source: "agent", modified: null },
        ],
      },
      specs_read: ["Linked ticket #4", "docs/a.md", "specs/b.md"],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // Configuration: attached documents with their tokens, intent refs as before
    expect(screen.getByText("docs/a.md · 10 tokens")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md · 20 tokens")).toBeInTheDocument();
    expect(screen.getByText("Linked ticket #4")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted) · 30 tokens")).toBeInTheDocument();
    expect(screen.getByText("↳ docs/a.md · 10 tokens · agent")).toBeInTheDocument();
    // AC-58: the label only when modified is true; old traces (absent or null) and false have none
    expect(screen.getByText("↳ specs/b.md · 20 tokens · skill:secret-gate · truncated · Modified locally")).toBeInTheDocument();
    expect(screen.getByText("↳ docs/c.md · 5 tokens · agent")).toBeInTheDocument();
    expect(screen.getByText("↳ docs/d.md · 6 tokens · agent")).toBeInTheDocument();
    // the generic specs block is replaced, not duplicated
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();
    // a sub-block opens to the full text sent to the model
    fireEvent.click(screen.getByText("↳ docs/a.md · 10 tokens · agent"));
    expect(screen.getByText("A text")).toBeInTheDocument();
  });

  it("without context blocks there are no sub-blocks and Specs read shows the refs or none (AC-44)", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("none")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText(/Project context — attached specs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^↳ /)).not.toBeInTheDocument();
  });
});
