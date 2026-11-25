import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";

const { push, mutateAsync } = vi.hoisted(() => ({ push: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync, isPending: false }),
}));

import { CreateAgentModal } from "./CreateAgentModal";

afterEach(() => {
  cleanup();
  push.mockReset();
  mutateAsync.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const createButton = () => screen.getByRole("button", { name: /Create agent/ });

describe("CreateAgentModal", () => {
  it("creates with the typed name and defaults, then opens the new agent's config", async () => {
    mutateAsync.mockResolvedValue({ id: "ag9" });
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Security Reviewer"), { target: { value: "  Perf Reviewer  " } });
    fireEvent.click(createButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/agents/ag9?tab=config"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Perf Reviewer", provider: "openai", model: "gpt-4.1" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the default name when the name is blank", async () => {
    mutateAsync.mockResolvedValue({ id: "ag10" });
    renderModal();
    fireEvent.click(createButton());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]![0].name).toBe("New Agent");
  });

  it("does not navigate when creation fails", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    const onClose = renderModal();
    // Click inside act and flush microtasks, so the rejected mutateAsync and the
    // handler's catch have fully settled before asserting nothing happened.
    await act(async () => {
      fireEvent.click(createButton());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(createButton()).toBeInTheDocument(); // the modal stayed open
  });
});
