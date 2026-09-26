import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const updateMutate = vi.fn();
const SKILL: Skill = {
  id: "s1", name: "pr-quality-rubric", description: "Baseline bar.", type: "rubric", source: "imported_file",
  body: "# Rubric\n\nCite lines.", enabled: false, version: 2, evidence_files: null, agent_count: 0,
};
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillPanel } from "./SkillPanel";

afterEach(cleanup);

describe("SkillPanel", () => {
  it("previews the skill with its badges and switches to the edit form", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <SkillPanel id="s1" onClose={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    expect(screen.getByText("Cite lines.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Edit"));
    const desc = screen.getByDisplayValue("Baseline bar.");
    fireEvent.change(desc, { target: { value: "Flag every finding without a citation." } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: expect.objectContaining({ description: "Flag every finding without a citation.", body: SKILL.body }) },
      expect.anything(),
    );
  });
});
