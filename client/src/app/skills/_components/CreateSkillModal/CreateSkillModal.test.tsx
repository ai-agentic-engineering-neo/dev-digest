import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";

const { push, mutateAsync } = vi.hoisted(() => ({ push: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
});

function renderModal() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <CreateSkillModal onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

const fill = (name: string, body: string) => {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), { target: { value: body } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

describe("CreateSkillModal", () => {
  it("creates the skill and opens its Config tab", async () => {
    mutateAsync.mockResolvedValue({ id: "sk9", name: "secret-leakage-gate" });
    const onClose = renderModal();
    fill("secret-leakage-gate", "# Secrets");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/sk9?tab=config"));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "secret-leakage-gate",
      description: "",
      type: "security",
      body: "# Secrets",
    });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText("Created secret-leakage-gate")).toBeInTheDocument();
  });

  it("shows validation errors instead of submitting an invalid form", () => {
    renderModal();
    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    submit();
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    fill("Not Kebab", "x");
    expect(screen.getByText(/Use kebab-case/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("marks the name as taken on 409 and stays open", async () => {
    mutateAsync.mockRejectedValue(new ApiError("duplicate", 409));
    const onClose = renderModal();
    fill("secret-leakage-gate", "# Secrets");
    await act(async () => {
      submit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText("A skill with this name already exists.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Editing the name clears the clash.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "secret-leakage-gate-2" } });
    expect(screen.queryByText("A skill with this name already exists.")).not.toBeInTheDocument();
  });
});
