import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { move, orderedSkills, toggleSkill } from "./helpers";

const setSkills = vi.fn();
let links: AgentSkillLink[] | undefined = [];

vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: links, isPending: links === undefined }),
  useSetAgentSkills: () => ({ mutate: setSkills, isPending: false }),
}));

const SKILLS: Skill[] = [
  {
    id: "a",
    name: "test-coverage-rubric",
    description: "Uncovered branches",
    type: "rubric",
    source: "manual",
    body: "#",
    enabled: true,
    version: 1,
    evidence_files: null,
    agent_count: 1,
  },
  {
    id: "b",
    name: "mock-overuse-gate",
    description: "Over-mocking",
    type: "custom",
    source: "manual",
    body: "#",
    enabled: true,
    version: 1,
    evidence_files: null,
    agent_count: 1,
  },
  {
    id: "c",
    name: "flaky-test-heuristics",
    description: "Flakiness",
    type: "custom",
    source: "community",
    body: "#",
    enabled: false,
    version: 1,
    evidence_files: null,
    agent_count: 0,
  },
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: agentMessages, skills: skillMessages }}
    >
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  setSkills.mockClear();
  links = [
    { agent_id: "ag1", skill_id: "a", order: 0 },
    { agent_id: "ag1", skill_id: "b", order: 1 },
  ];
});

describe("SkillsTab", () => {
  it("counts the linked skills against the workspace total", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("lists every skill in the system, each with its own on/off toggle", () => {
    renderTab();
    const toggles = screen.getAllByRole("switch");
    // All three skills, not only the two this agent links.
    expect(toggles).toHaveLength(3);
    expect(toggles.filter((el) => el.getAttribute("aria-checked") === "true")).toHaveLength(2);
    expect(toggles.filter((el) => el.getAttribute("aria-checked") === "false")).toHaveLength(1);
  });

  it("shows linked skills first, with their prompt position", () => {
    renderTab();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    // The unlinked one carries no position.
    expect(screen.queryByText("#3")).not.toBeInTheDocument();
  });

  it("attaching a skill appends it to the end of the order", () => {
    renderTab();
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[2]!);
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["a", "b", "c"] },
      expect.anything(),
    );
  });

  it("detaching a skill keeps the order of the rest", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["b"] },
      expect.anything(),
    );
  });

  it("moving a skill down swaps it with the next block", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move test-coverage-rubric later in the prompt"));
    expect(setSkills).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["b", "a"] },
      expect.anything(),
    );
  });

  it("cannot move the first block up or the last block down", () => {
    renderTab();
    expect(screen.getByLabelText("Move test-coverage-rubric earlier in the prompt")).toBeDisabled();
    expect(screen.getByLabelText("Move mock-overuse-gate later in the prompt")).toBeDisabled();
  });

  it("marks a globally disabled skill so an empty prompt block is explainable", () => {
    renderTab();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("hides rows that do not match the filter", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "mock" } });
    expect(screen.getByText("mock-overuse-gate")).toBeInTheDocument();
    expect(screen.queryByText("test-coverage-rubric")).not.toBeInTheDocument();
  });

  it("keeps the linked rows in prompt order while filtering", () => {
    renderTab();
    // "te" matches both linked skills, so the positions stay observable.
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "te" } });
    const positions = screen.getAllByText(/^#\d+$/).map((el) => el.textContent);
    expect(positions).toEqual(["#1", "#2"]);
  });

  it("renders nothing clickable until the agent's links have loaded", () => {
    // The endpoint REPLACES the whole set, so a click on an empty list would
    // unlink every skill the agent already had.
    links = undefined;
    renderTab();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(setSkills).not.toHaveBeenCalled();
  });
});

describe("SkillsTab helpers", () => {
  it("move() returns a new array and leaves out-of-range moves alone", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b"], 0, 0)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("toggleSkill() appends on attach and preserves order on detach", () => {
    expect(toggleSkill(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSkill(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("orderedSkills() puts linked ones first, then the rest alphabetically", () => {
    const rows = orderedSkills(SKILLS, ["b", "a"], "");
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});
