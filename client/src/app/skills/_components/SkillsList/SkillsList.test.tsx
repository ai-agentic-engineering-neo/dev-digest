import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillsList } from "./SkillsList";

afterEach(cleanup);

const SKILLS: Skill[] = [
  {
    id: "a",
    name: "pr-quality-rubric",
    description: "Evaluates overall PR quality.",
    type: "rubric",
    source: "manual",
    body: "#",
    enabled: true,
    version: 5,
    evidence_files: null,
    agent_count: 3,
  },
  {
    id: "b",
    name: "secret-leakage-gate",
    description: "Detects committed credentials.",
    type: "security",
    source: "manual",
    body: "#",
    enabled: true,
    version: 1,
    evidence_files: null,
    agent_count: 1,
  },
];

function renderList(props: Partial<React.ComponentProps<typeof SkillsList>> = {}) {
  const defaults: React.ComponentProps<typeof SkillsList> = {
    skills: SKILLS,
    selectedId: null,
    search: "",
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onImportFile: vi.fn(),
    onImportCommunity: vi.fn(),
    onRetry: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsList {...merged} />
    </NextIntlClientProvider>,
  );
  return merged;
}

describe("SkillsList", () => {
  it("renders a card per skill", () => {
    renderList();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
  });

  it("clicking a card selects it by id", () => {
    const props = renderList();
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("the card toggle reports the skill and the new state", () => {
    const props = renderList();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(props.onToggle).toHaveBeenCalledWith(SKILLS[0], false);
  });

  it("shows only the skills matching the search text", () => {
    renderList({ search: "secret" });
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
  });

  it("offers the empty-state CTA when there are no skills at all", () => {
    const props = renderList({ skills: [] });
    fireEvent.click(screen.getByText("Create your first skill"));
    expect(props.onCreate).toHaveBeenCalled();
  });

  it("surfaces a load failure with a retry instead of an empty list", () => {
    const props = renderList({ skills: [], isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load skills.");
    fireEvent.click(screen.getByText("Retry"));
    expect(props.onRetry).toHaveBeenCalled();
  });
});
