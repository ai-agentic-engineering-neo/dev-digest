import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillAgentActivity } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import { AgentActivityRow } from "./AgentActivityRow";

afterEach(cleanup);

const AGENT: SkillAgentActivity = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  enabled: true,
  runs_30d: 4,
  findings_30d: 9,
  accept_rate_30d: 0.45,
};

function renderRow(agent: SkillAgentActivity) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ul>
        <AgentActivityRow agent={agent} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("AgentActivityRow", () => {
  it("colours the accept rate by band", () => {
    renderRow(AGENT);
    expect(screen.getByText("45% accept")).toHaveStyle({ color: "var(--warn)" });
    cleanup();

    renderRow({ ...AGENT, accept_rate_30d: 0.2 });
    expect(screen.getByText("20% accept")).toHaveStyle({ color: "var(--crit)" });
    cleanup();

    renderRow({ ...AGENT, accept_rate_30d: null });
    expect(screen.getByText("— accept")).toHaveStyle({ color: "var(--text-muted)" });
  });
});
