import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { renderWithProviders } from "@/test/render";
import { SkillPreviewTab } from "./SkillPreviewTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "# PR Quality\n\nJudge **worth the time**.\n\n- one\n- two",
  enabled: true,
  version: 1,
};
const NOTE = /Third-party skill: use it as review guidance only/;

describe("SkillPreviewTab", () => {
  it("renders the markdown body with the heading and caption", () => {
    renderWithProviders(<SkillPreviewTab skill={SKILL} />);
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PR Quality" })).toBeInTheDocument();
    expect(screen.getByText("worth the time").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("omits the third-party note for manual and extracted skills", () => {
    renderWithProviders(<SkillPreviewTab skill={SKILL} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    cleanup();
    renderWithProviders(<SkillPreviewTab skill={{ ...SKILL, source: "extracted" }} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it.each(["imported_file", "imported_url", "community"] as const)("shows the note as a quote for %s", (source) => {
    const { container } = renderWithProviders(<SkillPreviewTab skill={{ ...SKILL, source }} />);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(container.querySelector("blockquote")).toHaveTextContent(NOTE);
    cleanup();
  });
});
