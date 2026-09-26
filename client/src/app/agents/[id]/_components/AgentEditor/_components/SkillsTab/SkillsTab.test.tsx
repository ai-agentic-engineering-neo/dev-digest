/**
 * SkillsTab — a refetch must not wipe an unsaved draft (WP6 /
 * frontend-react-1-2): a background `links`/`skills` refetch (new object
 * references) keeps the user's in-progress edit, and only a successful save
 * replaces the draft with server data.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

function skill(o: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    description: "",
    type: "rubric",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    ...o,
  };
}

const state = vi.hoisted(() => ({
  skills: [] as Skill[],
  links: [] as AgentSkillLink[],
  saveMutate: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: state.skills, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/agent-skills", () => ({
  useAgentSkills: () => ({ data: state.links, isLoading: false }),
  useSetAgentSkills: () => ({ mutate: state.saveMutate, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "a1",
  name: "Reviewer",
  description: "",
  provider: "anthropic",
  model: "claude-sonnet-5",
  system_prompt: "",
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

beforeEach(() => {
  // buildRows puts attached links first (in link order), then the rest
  // alphabetically — so with only "alpha" attached the visible order is
  // [alpha, beta] and the switches are in that same order.
  state.skills = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta" })];
  state.links = [{ agent_id: "a1", skill_id: "s1", order: 0, enabled: true }];
  state.saveMutate = vi.fn();
});
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("keeps an in-progress edit across a rerender with a new `links` reference", () => {
    const { rerender } = renderTab();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();

    // Attach "beta" — the second switch (alpha is attached/first, beta is
    // detached/second).
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();

    // Simulate a background refetch: same logical links, new array identity.
    state.links = [{ agent_id: "a1", skill_id: "s1", order: 0, enabled: true }];
    rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
        <SkillsTab agent={AGENT} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
  });

  it("replaces the draft with server data once the save succeeds", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("switch")[1]!); // attach "beta"
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));
    expect(state.saveMutate).toHaveBeenCalledTimes(1);

    // Simulate the post-save server truth arriving with a DIFFERENT skill
    // name, so the assertion below can only pass if the draft was actually
    // dropped in favour of fresh server data, not coincidentally unchanged.
    state.skills = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta-renamed" })];
    state.links = [
      { agent_id: "a1", skill_id: "s1", order: 0, enabled: true },
      { agent_id: "a1", skill_id: "s2", order: 1, enabled: true },
    ];

    const [, opts] = state.saveMutate.mock.calls[0]!;
    act(() => opts.onSuccess());

    expect(screen.getByText("beta-renamed")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
  });
});
