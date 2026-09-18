/**
 * The drawer's Stats row must apply the same "no data vs. free" rule as the PR
 * list and the timeline: a priced run shows its cost, an unpriced one shows an
 * em dash — never "$0.00" for a run that simply has no cost recorded.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [];

function baseTrace(statsOverride: Partial<RunTrace["stats"]>): RunTrace {
  return {
    config: {
      agent: "Security Reviewer",
      version: "1",
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      pr: 482,
      source: "local",
    },
    stats: {
      duration_ms: 8200,
      tokens_in: 9000,
      tokens_out: 119,
      cost_usd: null,
      findings: 0,
      grounding: "0/0 passed",
      ...statsOverride,
    },
    prompt_assembly: { system: "You are a reviewer.", user: "Review PR #482" },
    tool_calls: [],
    raw_output: '{"verdict":"approved"}',
    memory_pulled: [],
    specs_read: [],
    log: [],
  };
}

function renderBody(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace} findings={FINDINGS} />
    </NextIntlClientProvider>,
  );
}

describe("TraceBody — Stats row cost tile", () => {
  it("shows the run's cost when it is priced", () => {
    renderBody(baseTrace({ cost_usd: 0.0013 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows an em dash, not $0.00, when the run has no cost recorded", () => {
    renderBody(baseTrace({ cost_usd: null }));
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
