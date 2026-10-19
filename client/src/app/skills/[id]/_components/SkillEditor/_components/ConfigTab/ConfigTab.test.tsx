import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const updateMutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Use when reviewing overall quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\n## Tests",
  enabled: true,
  version: 5,
};

function renderTab(skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("numbers every body line and names the file after the skill", () => {
    renderTab();
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("saves a body change with its change note, sending only changed fields", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# PR Quality Rubric\n\n## Scope" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Change note"), { target: { value: " Added Scope " } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "# PR Quality Rubric\n\n## Scope", version_message: "Added Scope" } },
      expect.anything(),
    );
  });

  it("asks for no change note when only metadata changes", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "quality" } });
    expect(screen.queryByLabelText("Change note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { name: "quality" } }, expect.anything());
  });

  it("warns that an imported skill is someone else's instructions", () => {
    renderTab({ ...SKILL, source: "imported", enabled: false });
    expect(screen.getByRole("note")).toHaveTextContent(/someone else's instructions/);
  });
});
