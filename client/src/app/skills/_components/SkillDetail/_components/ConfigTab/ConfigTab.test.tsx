import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { toDraft, type SkillDraft } from "../../../../helpers";
import { isDirty } from "../../helpers";
import { ConfigTab } from "./ConfigTab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flag low-quality PRs",
  type: "rubric",
  source: "manual",
  body: "# Rubric\nCheck tests.",
  enabled: true,
  version: 5,
  agent_count: 3,
  token_count: 166,
};

/** Holds the draft the way SkillDetail does. */
function Harness({ skill }: { skill: Skill }) {
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const current = draft ?? toDraft(skill);
  return (
    <ConfigTab
      skill={skill}
      draft={current}
      dirty={!!draft && isDirty(toDraft(skill), draft)}
      onChange={(patch) => setDraft({ ...current, ...patch })}
      onDiscard={() => setDraft(null)}
      onSaved={() => setDraft(null)}
    />
  );
}

const body = () => screen.getByRole("textbox", { name: "Skill body" });

describe("Skill ConfigTab", () => {
  it("shows the server token count while clean, marks edits unsaved and blocks Save without a name", () => {
    mockApi(() => SKILL);
    renderWithProviders(<Harness skill={SKILL} />);
    expect(screen.getByText(/Phrase it as a directive/)).toBeInTheDocument();
    expect(screen.getByText("166 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    fireEvent.change(body(), { target: { value: "x".repeat(9) } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("≈ 3 tokens")).toBeInTheDocument();
    fireEvent.change(body(), { target: { value: SKILL.body } });
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("pr-quality-rubric"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks for a note on Save and sends it in the PATCH", async () => {
    const calls = mockApi((method) => (method === "PATCH" ? { ...SKILL, version: 6, body: "new body" } : SKILL));
    renderWithProviders(<Harness skill={SKILL} />);
    fireEvent.change(body(), { target: { value: "new body" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const dialog = screen.getByRole("dialog", { name: "Save as v6" });
    fireEvent.change(screen.getByLabelText("Change note"), { target: { value: "Tightened scope" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save as v6" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toEqual({
      method: "PATCH",
      path: "/skills/sk1",
      body: { body: "new body", note: "Tightened scope" },
    });
  });
});
