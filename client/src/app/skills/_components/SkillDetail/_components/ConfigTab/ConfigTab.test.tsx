import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const update = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: update, isPending: false, isSuccess: false, data: undefined }),
}));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Evaluates overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\nCheck correctness.",
  enabled: true,
  version: 5,
  evidence_files: null,
  agent_count: 3,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  update.mockClear();
});

describe("skill ConfigTab", () => {
  it("tells the author that the description is the skill's interface", () => {
    renderTab();
    expect(screen.getByText(/write it as a directive/i)).toBeInTheDocument();
  });

  it("names the body after the skill and shows its token estimate", () => {
    renderTab();
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    // ceil(38 / 4) = 10 — the same heuristic the server falls back to.
    expect(screen.getByText(`≈${Math.ceil(SKILL.body.length / 4)} tokens`)).toBeInTheDocument();
  });

  it("marks the body unsaved only after it is edited", () => {
    renderTab();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("pr-quality-rubric.md"), {
      target: { value: "# Changed" },
    });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("asks what changed only when the body changed, and sends it with the save", () => {
    renderTab();
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("pr-quality-rubric.md"), {
      target: { value: "# Changed" },
    });
    const note = screen.getByPlaceholderText("Tightened the scope rule");
    fireEvent.change(note, { target: { value: "Tighter scope" } });
    fireEvent.click(screen.getByText("Save skill"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ body: "# Changed", note: "Tighter scope" }),
      }),
      expect.anything(),
    );
  });

  it("saves metadata without a note when the body is untouched", () => {
    renderTab();
    fireEvent.click(screen.getByText("Save skill"));
    const [{ patch }] = update.mock.calls[0]!;
    expect(patch.body).toBe(SKILL.body);
    expect(patch).not.toHaveProperty("note");
  });

  it("warns that an imported skill's text runs as instructions", () => {
    renderTab({ ...SKILL, source: "community" });
    expect(screen.getByRole("note")).toHaveTextContent(/runs as instructions/i);
  });

  it("shows no such warning for a workspace-authored skill", () => {
    renderTab();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
