import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1", name: "breaking-change", description: "Detect breaking changes.", type: "rubric", source: "manual",
  body: "b", enabled: true, version: 2, evidence_files: null, agent_count: 2,
};

describe("SkillCard", () => {
  it("shows version and agent count; the open surface is a button and Delete asks the grid, not the card", () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillCard skill={SKILL} onClick={onClick} onToggle={() => {}} onDelete={onDelete} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "breaking-change" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1); // delete does not open the card
  });
});
