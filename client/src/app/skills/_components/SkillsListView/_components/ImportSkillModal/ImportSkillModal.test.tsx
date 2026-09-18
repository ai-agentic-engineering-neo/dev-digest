import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/skills.json";

const preview = vi.fn();
const confirm = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  usePreviewSkillImport: () => ({ mutateAsync: preview, isPending: false }),
  useConfirmSkillImport: () => ({ mutateAsync: confirm, isPending: false }),
}));

vi.mock("@devdigest/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devdigest/ui")>();
  return {
    ...actual,
    Markdown: ({ children }: { children?: string }) => <div>{children}</div>,
  };
});

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  preview.mockReset();
  confirm.mockReset();
});

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillModal onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["# x"], "flaky-tests.md", { type: "text/markdown" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(preview).toHaveBeenCalled());
}

describe("ImportSkillModal", () => {
  it("shows the trust warning before Confirm and keeps Confirm disabled without a preview", () => {
    renderModal();
    expect(screen.getByText(/becomes instructions in the review prompt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });

  it("keeps Confirm disabled while description is empty", async () => {
    preview.mockResolvedValue({ name: "flaky-tests", description: "", body: "# Flaky tests\nFlag sleep." });
    renderModal();
    await pickFile();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("calls persist on Confirm and does not persist on Cancel", async () => {
    preview.mockResolvedValue({
      name: "flaky-tests",
      description: "Flag tests that depend on time, order, or unseeded randomness.",
      body: "# Flaky tests\nFlag sleep.",
    });
    confirm.mockResolvedValue({ id: "s1" });
    const onClose = vi.fn();
    renderModal(onClose);
    await pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith({
      name: "flaky-tests",
      description: "Flag tests that depend on time, order, or unseeded randomness.",
      type: "custom",
      body: "# Flaky tests\nFlag sleep.",
    });

    cleanup();
    confirm.mockReset();
    renderModal(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
