/**
 * NewSkillModal — a rejected create must leave the modal open with no
 * unhandled promise rejection (WP4 / frontend-react-2-3).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const createMutateAsync = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useSkillTypes: () => ({ data: [{ id: "t1", name: "custom" }] }),
}));

import { NewSkillModal } from "./NewSkillModal";

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <NewSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

/** Fills the two required fields the default type does not already satisfy. */
function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
    target: { value: "New Skill" },
  });
  const boxes = screen.getAllByRole("textbox");
  fireEvent.change(boxes[boxes.length - 1]!, { target: { value: "# body" } });
}

beforeEach(() => {
  createMutateAsync.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("NewSkillModal", () => {
  it("keeps the modal open and raises no unhandled rejection when create fails", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("boom"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const onClose = renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    // unhandledRejection fires on a later microtask/macrotask than the catch.
    await new Promise((r) => setTimeout(r, 0));

    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();

    process.off("unhandledRejection", unhandled);
  });

  it("creates the skill and opens it when create succeeds", async () => {
    createMutateAsync.mockResolvedValueOnce({ id: "s9" });
    const onClose = renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/skills/s9?tab=config");
  });
});
