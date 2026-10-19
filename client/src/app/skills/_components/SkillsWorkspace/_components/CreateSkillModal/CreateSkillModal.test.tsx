import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const createMutate = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, error: null }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <CreateSkillModal onClose={() => {}} onCreated={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillModal", () => {
  it("tells the author to write the description as a directive interface", () => {
    renderModal();
    expect(screen.getByText(/skill's interface/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("creates the skill once name, description and body are filled", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " corner-cases " } });
    fireEvent.change(screen.getByPlaceholderText("Use when … Flag …"), { target: { value: "Use when numbers change." } });
    fireEvent.change(screen.getByPlaceholderText(/# Rule/), { target: { value: "# Rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "corner-cases", type: "rubric", body: "# Rule" }),
      expect.anything(),
    );
  });
});
