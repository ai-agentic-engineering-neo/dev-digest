import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutateMock = vi.fn();

// Mock the data hooks so SkillsTab renders without a network/query client —
// same pattern as AgentEditor.test.tsx / ReviewRunAccordion.test.tsx.
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: mutateMock, isPending: false }),
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { SkillsTab } from "./SkillsTab";
import { checkedOrder, computeInitialChecked, computeInitialOrder, reorderVisible } from "./helpers";

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

// sk2 is linked; sk1/sk3 are not — unlinked skills sort by name ("Custom
// Style" < "Security Rubric"), so the initial display order is
// [sk2, sk3, sk1] (linked first, then unlinked alphabetically).
const SKILLS: Skill[] = [
  { id: "sk1", name: "Security Rubric", description: "d", type: "security", source: "manual", body: "", enabled: true, version: 1 },
  { id: "sk2", name: "Naming Convention", description: "d", type: "convention", source: "imported_url", body: "", enabled: true, version: 1 },
  { id: "sk3", name: "Custom Style", description: "d", type: "custom", source: "manual", body: "", enabled: true, version: 1 },
];

const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk2", order: 0 }];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("renders every workspace skill, linked ones first in link order", () => {
    renderTab();
    const names = screen.getAllByText(/Convention|Rubric|Style/).map((el) => el.textContent);
    expect(names).toEqual(["Naming Convention", "Custom Style", "Security Rubric"]);
  });

  it("shows an Imported badge only for non-manual skills", () => {
    renderTab();
    // sk2 (imported_url) gets the badge, sk1/sk3 (manual) don't.
    expect(screen.getAllByText("Imported")).toHaveLength(1);
  });

  it("checking an unlinked skill POSTs it appended at the end of the checked order", () => {
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    // Display order is [sk2 (checked), sk3 (unchecked), sk1 (unchecked)].
    const securityRubricCheckbox = checkboxes[2]!;
    fireEvent.click(securityRubricCheckbox);
    expect(mutateMock).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk2", "sk1"] });
  });

  it("unchecking a linked skill removes it from the posted skill_ids", () => {
    renderTab();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!); // sk2, the only initially-checked row
    expect(mutateMock).toHaveBeenCalledWith({ agentId: "ag1", skillIds: [] });
  });

  it("filters the list by name", () => {
    renderTab();
    const input = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(input, { target: { value: "custom" } });
    expect(screen.getByText("Custom Style")).toBeInTheDocument();
    expect(screen.queryByText("Security Rubric")).not.toBeInTheDocument();
    expect(screen.queryByText("Naming Convention")).not.toBeInTheDocument();
  });
});

describe("SkillsTab helpers (drag reorder at low fidelity — no pointer events needed)", () => {
  it("computeInitialOrder puts linked skills first (by order), then unlinked skills by name", () => {
    expect(computeInitialOrder(SKILLS, LINKS)).toEqual(["sk2", "sk3", "sk1"]);
  });

  it("computeInitialChecked seeds the checked set from the link list", () => {
    expect(computeInitialChecked(LINKS)).toEqual(new Set(["sk2"]));
  });

  it("checkedOrder filters a row order down to only the checked ids, preserving order", () => {
    expect(checkedOrder(["sk2", "sk3", "sk1"], new Set(["sk1", "sk2"]))).toEqual(["sk2", "sk1"]);
  });

  it("reorderVisible moves a dragged row within the full list and recomputes skill_ids", () => {
    const rows = ["sk2", "sk3", "sk1"];
    // Drag sk1 (last) to the first slot.
    const nextRows = reorderVisible(rows, rows, "sk1", "sk2");
    expect(nextRows).toEqual(["sk1", "sk2", "sk3"]);
    expect(checkedOrder(nextRows, new Set(["sk1", "sk2"]))).toEqual(["sk1", "sk2"]);
  });

  it("reorderVisible only reshuffles the visible subset, leaving other rows' slots untouched", () => {
    const rows = ["sk2", "sk3", "sk1"];
    // Only sk3/sk1 are "visible" (e.g. matched a filter) — reordering them
    // must not disturb sk2's slot.
    const nextRows = reorderVisible(rows, ["sk3", "sk1"], "sk1", "sk3");
    expect(nextRows).toEqual(["sk2", "sk1", "sk3"]);
  });
});
