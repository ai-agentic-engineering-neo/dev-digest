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
  it("shows name, description, type, source and agent count; the name is a pressed button when active and the toggle does not open it", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillCard skill={SKILL} active onClick={onClick} onToggle={onToggle} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Detect breaking changes.")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.queryByText("v2")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete skill")).not.toBeInTheDocument();
    const open = screen.getByRole("button", { name: "breaking-change" });
    expect(open).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(open);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).toHaveBeenCalledTimes(1); // the toggle does not open the card
  });
});
