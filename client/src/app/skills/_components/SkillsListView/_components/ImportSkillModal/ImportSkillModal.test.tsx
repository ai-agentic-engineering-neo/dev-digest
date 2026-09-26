import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/skills.json";

const previewMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useSkillTypes: () => ({ data: [{ id: "t1", name: "custom" }] }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

const PREVIEW = {
  name: "Secret Gate",
  description: "Flags leaks.",
  type: "custom",
  source: "manual" as const,
  body: "# Secret Gate\n\nFlags leaks.\n",
};

function renderModal(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillModal onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

const fileInput = () => screen.getByLabelText("Choose a .md file") as HTMLInputElement;

function pick(name: string, content: string) {
  const file = new File([content], name, { type: "text/markdown" });
  // jsdom's File has no usable .text() in this environment; stub it.
  Object.defineProperty(file, "text", { value: () => Promise.resolve(content) });
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

beforeEach(() => {
  previewMutateAsync.mockReset().mockResolvedValue(PREVIEW);
  createMutateAsync.mockReset().mockResolvedValue({ id: "s9", ...PREVIEW });
  push.mockReset();
});
afterEach(cleanup);

describe("ImportSkillModal", () => {
  it("shows no preview and cannot confirm before a file is chosen", () => {
    renderModal();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeDisabled();
  });

  it("previews a markdown file without creating anything", async () => {
    renderModal();
    pick("secret-gate.md", "# Secret Gate\n\nFlags leaks.\n");

    expect(await screen.findByText("Preview")).toBeInTheDocument();
    expect(previewMutateAsync).toHaveBeenCalledWith({
      filename: "secret-gate.md",
      content: "# Secret Gate\n\nFlags leaks.\n",
    });
    // The whole point of a preview: nothing is persisted yet.
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Secret Gate")).toBeInTheDocument();
  });

  it("rejects a non-markdown file without calling the server", async () => {
    // Archive import is deliberately unsupported — it must fail loudly, not
    // silently send a binary blob as a skill body.
    renderModal();
    pick("skills.zip", "PK\u0003\u0004binary");

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a Markdown file/i);
    expect(previewMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
  });

  it("creates the skill only after the user confirms, then opens it", async () => {
    const onClose = renderModal();
    pick("secret-gate.md", "# Secret Gate\n\nFlags leaks.\n");
    await screen.findByText("Preview");

    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      name: "Secret Gate",
      description: "Flags leaks.",
      type: "custom",
      body: "# Secret Gate\n\nFlags leaks.\n",
    });
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/s9?tab=config");
  });

  it("lets the user correct the derived name before confirming", async () => {
    renderModal();
    pick("secret-gate.md", "# Secret Gate\n\nFlags leaks.\n");
    await screen.findByText("Preview");

    fireEvent.change(screen.getByDisplayValue("Secret Gate"), {
      target: { value: "secret-leakage-gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0]![0]).toMatchObject({ name: "secret-leakage-gate" });
  });

  it("cancelling creates nothing", async () => {
    const onClose = renderModal();
    pick("secret-gate.md", "# x\n\ny\n");
    await screen.findByText("Preview");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the modal open and raises no unhandled rejection when create fails", async () => {
    createMutateAsync.mockReset().mockRejectedValueOnce(new Error("boom"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const onClose = renderModal();
    pick("secret-gate.md", "# Secret Gate\n\nFlags leaks.\n");
    await screen.findByText("Preview");

    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    // unhandledRejection fires on a later microtask/macrotask than the catch.
    await new Promise((r) => setTimeout(r, 0));

    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();

    process.off("unhandledRejection", unhandled);
  });
});
