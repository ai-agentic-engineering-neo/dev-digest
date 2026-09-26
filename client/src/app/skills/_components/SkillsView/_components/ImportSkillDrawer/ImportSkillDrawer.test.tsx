import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const PREVIEW = {
  name: "async-test-hygiene",
  description: "Await everything.",
  type: "convention" as const,
  body: "# Async\nRule.",
  source_file: "async-test-hygiene/SKILL.md",
  ignored_files: ["async-test-hygiene/scripts/check.sh"],
  warnings: ["1 executable file(s) in the archive were listed but never opened or run."],
};
const previewMutate = vi.fn((_input: unknown, opts?: { onSuccess?: (p: typeof PREVIEW) => void }) => opts?.onSuccess?.(PREVIEW));
const createMutateAsync = vi.fn(async (input: unknown) => ({ id: "new", ...(input as object) }));
vi.mock("../../../../../../lib/hooks/skills", () => ({
  usePreviewSkillImport: () => ({ mutate: previewMutate, data: PREVIEW, isPending: false, error: null }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(cleanup);

describe("ImportSkillDrawer", () => {
  it("uploads a file, shows the preview with ignored entries, and saves only on confirm with source imported_file", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ImportSkillDrawer onClose={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(createMutateAsync).not.toHaveBeenCalled();
    const input = screen.getByLabelText("File (.md or .zip)") as HTMLInputElement;
    const file = new File(["PK..."], "async-test-hygiene.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(previewMutate).toHaveBeenCalled());
    expect(previewMutate.mock.calls[0]![0]).toMatchObject({ filename: "async-test-hygiene.zip" });
    expect(await screen.findByDisplayValue("async-test-hygiene")).toBeInTheDocument();
    expect(screen.getByText("async-test-hygiene/scripts/check.sh")).toBeInTheDocument();
    expect(screen.getByText(/1 executable file\(s\).*never opened or run/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Import skill"));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0]![0]).toMatchObject({ name: "async-test-hygiene", source: "imported_file", enabled: false });
  });
});
