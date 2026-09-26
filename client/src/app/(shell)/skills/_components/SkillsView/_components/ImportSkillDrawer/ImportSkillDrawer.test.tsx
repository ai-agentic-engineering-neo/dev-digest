import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false, isError: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(() => {
  cleanup();
  previewMutate.mockClear();
  createMutate.mockClear();
});

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillDrawer onClose={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillDrawer — nothing is saved without confirming the preview", () => {
  it("only previews (never POSTs to /skills) from choosing a file", async () => {
    renderDrawer();
    const file = new File(["# Rule\nBody"], "rule.md", { type: "text/markdown" });
    const input = screen.getByLabelText("Choose file…") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(previewMutate).toHaveBeenCalledTimes(1));
    expect(previewMutate.mock.calls[0]?.[0]).toEqual({
      filename: "rule.md",
      content_base64: expect.any(String),
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("POSTs to /skills only once Save (disabled) is clicked on the confirmed preview", async () => {
    renderDrawer();
    const file = new File(["# Rule\nBody"], "rule.md", { type: "text/markdown" });
    const input = screen.getByLabelText("Choose file…") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(previewMutate).toHaveBeenCalledTimes(1));

    // Simulate the server's preview response landing (writes nothing itself).
    const onSuccess = previewMutate.mock.calls[0]?.[1]?.onSuccess as (data: unknown) => void;
    act(() => {
      onSuccess({
        name: "pr-quality-rubric",
        description: "A rubric",
        type: "rubric",
        body: "# Rule\nBody",
        ignored_files: ["notes.txt"],
        warnings: ["A large attachment was truncated"],
      });
    });

    const saveBtn = await screen.findByRole("button", { name: "Save (disabled)" });
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.click(saveBtn);

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({
      name: "pr-quality-rubric",
      source: "imported_file",
    });
  });
});
