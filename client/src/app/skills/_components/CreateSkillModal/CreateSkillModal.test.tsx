import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ApiError } from "@/lib/api";

const created: Skill = {
  id: "sk-new",
  name: "flaky-guard",
  description: "Detects sleep-based synchronisation.",
  type: "custom",
  source: "manual",
  body: "# Rule\n\nFlag sleep().",
  enabled: true,
  version: 1,
  evidence_files: null,
  agent_count: 0,
};

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

function renderModal(props: Partial<React.ComponentProps<typeof CreateSkillModal>> = {}) {
  const merged = { onClose: vi.fn(), onCreated: vi.fn(), ...props };
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CreateSkillModal {...merged} />
    </NextIntlClientProvider>,
  );
  return merged;
}

/** The modal title and the submit button share the same copy — take the button. */
const submitButton = () => screen.getByRole("button", { name: /create skill/i });

/** Fill the required field the create button gates on. */
function fillForm(name = "flaky-guard") {
  fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
    target: { value: name },
  });
}

afterEach(cleanup);
// Block body on purpose: `mockReset()` RETURNS the mock, and a function
// returned from a vitest hook is treated as a teardown callback — vitest would
// call the mock again after the test, hitting whatever implementation it holds.
beforeEach(() => {
  mutateAsync.mockReset();
});

describe("CreateSkillModal", () => {
  it("tells the author that the description is the skill's interface", () => {
    renderModal();
    expect(screen.getByText(/write it as a directive/i)).toBeInTheDocument();
  });

  it("cannot be submitted without a name", () => {
    renderModal();
    expect(submitButton()).toBeDisabled();
  });

  it("creates the skill and hands it back to the caller", async () => {
    mutateAsync.mockResolvedValue(created);
    const props = renderModal();
    fillForm();
    fireEvent.click(submitButton());

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(created));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "flaky-guard", type: "custom" }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it("keeps the modal open and shows why when the create fails", async () => {
    mutateAsync.mockImplementation(async () => {
      throw new ApiError("Skill body cannot be empty.", 422);
    });
    const props = renderModal();
    fillForm();
    fireEvent.click(submitButton());

    // The failure is surfaced in place rather than becoming an unhandled
    // rejection with a modal that just sits there.
    expect(await screen.findByRole("alert")).toHaveTextContent("Skill body cannot be empty.");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
  });
});
