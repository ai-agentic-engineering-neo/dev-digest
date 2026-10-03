import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json"; // client/messages/en/runs.json
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

// The "Prompt assembly" TraceSection is collapsed by default; expand it so
// its PromptBlock children mount before asserting on them.
function renderWithPromptAssemblyOpen(ui: React.ReactElement) {
  const utils = renderWithIntl(ui);
  fireEvent.click(screen.getByText("Prompt assembly"));
  return utils;
}

const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

function traceWithSkills(skills: RunTrace["prompt_assembly"]["skills"]): RunTrace {
  return { ...BASE_TRACE, prompt_assembly: { ...BASE_TRACE.prompt_assembly, skills } };
}

describe("TraceBody — prompt assembly skills", () => {
  it("renders one PromptBlock per skill, in order", () => {
    const trace = traceWithSkills([
      { name: "lint-rules", body: "### lint", tokens: 100, untrusted: false },
      { name: "security-checklist", body: "### security", tokens: 250, untrusted: false },
    ]);
    renderWithPromptAssemblyOpen(<TraceBody trace={trace} findings={[]} />);

    const labels = screen.getAllByText(/^Skill: /).map((el) => el.textContent);
    expect(labels).toEqual(["Skill: lint-rules", "Skill: security-checklist"]);
  });

  it("renders no skill blocks when skills is null", () => {
    renderWithPromptAssemblyOpen(<TraceBody trace={traceWithSkills(null)} findings={[]} />);
    expect(screen.queryByText(/^Skill: /)).not.toBeInTheDocument();
  });

  it("renders no skill blocks when skills is an empty array", () => {
    renderWithPromptAssemblyOpen(<TraceBody trace={traceWithSkills([])} findings={[]} />);
    expect(screen.queryByText(/^Skill: /)).not.toBeInTheDocument();
  });

  it("shows the token count chip per skill", () => {
    const trace = traceWithSkills([{ name: "lint-rules", body: "### lint", tokens: 142, untrusted: false }]);
    renderWithPromptAssemblyOpen(<TraceBody trace={trace} findings={[]} />);
    expect(screen.getByText("142 tok")).toBeInTheDocument();
  });

  it("shows the Imported badge only for untrusted skills", () => {
    const trace = traceWithSkills([
      { name: "trusted-skill", body: "### a", tokens: 10, untrusted: false },
      { name: "pasted-skill", body: "### b", tokens: 20, untrusted: true },
    ]);
    renderWithPromptAssemblyOpen(<TraceBody trace={trace} findings={[]} />);
    expect(screen.getAllByText("Imported")).toHaveLength(1);
  });
});
