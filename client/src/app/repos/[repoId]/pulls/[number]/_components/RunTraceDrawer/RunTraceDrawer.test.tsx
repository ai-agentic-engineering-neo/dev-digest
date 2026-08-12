import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0124, findings: 2, grounding: "2/2 passed" },
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

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

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
    expect(screen.getByText("$0.0124")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows an estimated token count (with the tilde) on every prompt block, including skills", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));

    // system: "You are a reviewer." — 20 chars, ceil(20/4) = 5.
    expect(screen.getByText("~5 tok")).toBeInTheDocument();
    // skills: "### skill" — 9 chars, ceil(9/4) = 3. This is the block L02 wires
    // into the prompt; before that wire it was always null and never rendered.
    expect(screen.getByText("~3 tok")).toBeInTheDocument();
  });

  it("renders the Declared PR scope block when prompt_assembly.intent_scope is set, and omits it when null (specs/05-intent-layer.md revision 2)", () => {
    // TRACE.prompt_assembly.intent_scope is undefined by default (the mocked
    // hook returns this same object reference every render) — confirm it's
    // absent first, then mutate and confirm it appears.
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Declared PR scope (dynamic)")).not.toBeInTheDocument();
    cleanup();

    TRACE.prompt_assembly.intent_scope = "In scope:\n- Rate limiter middleware\n\nOut of scope:\n(none stated)";
    try {
      renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
      fireEvent.click(screen.getByText("Prompt assembly"));
      expect(screen.getByText("Declared PR scope (dynamic)")).toBeInTheDocument();
    } finally {
      TRACE.prompt_assembly.intent_scope = null;
    }
  });

  it("renders each specs_read entry's path, origin, status and reason (specs/09-project-context-folder.md), and still shows 'none' for the pre-feature empty-list traces", () => {
    // Baseline: TRACE.specs_read is [] by default — the empty-list case every
    // trace persisted before this feature carries.
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("none")).toBeInTheDocument();
    cleanup();

    TRACE.specs_read = [
      { path: "specs/09-project-context-folder.md", tokens: 240, origin: "agent", skill: null, status: "included", reason: null },
      { path: "docs/architecture.md", tokens: 90, origin: "skill", skill: "pr-quality-rubric", status: "dropped", reason: "budget_drop" },
    ];
    try {
      renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
      expect(screen.getByText("specs/09-project-context-folder.md")).toBeInTheDocument();
      expect(screen.getByText("direct")).toBeInTheDocument();
      expect(screen.getByText("included")).toBeInTheDocument();
      expect(screen.getByText("240 tok")).toBeInTheDocument();

      expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
      expect(screen.getByText("via skill pr-quality-rubric")).toBeInTheDocument();
      expect(screen.getByText("dropped")).toBeInTheDocument();
      expect(screen.getByText("(budget_drop)")).toBeInTheDocument();
    } finally {
      TRACE.specs_read = [];
    }
  });
});
