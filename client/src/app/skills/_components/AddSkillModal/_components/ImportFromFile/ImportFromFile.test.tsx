import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "branch-coverage",
  description: "Flag untested branches.",
  type: "rubric",
  body: "# Branch coverage\nEvery branch needs a test.",
  files: [
    { path: "bc/SKILL.md", status: "used" },
    { path: "bc/scripts/install.sh", status: "skipped", reason: "never executed" },
  ],
};
const parseMutate = vi.fn((_req: unknown, opts: { onSuccess: (p: SkillImportPreview) => void }) =>
  opts.onSuccess(PREVIEW),
);
const createMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: parseMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportFromFile } from "./ImportFromFile";

afterEach(() => {
  cleanup();
  parseMutate.mockClear();
  createMutate.mockClear();
});

function renderImport() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ImportFromFile onCreated={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Import skill from file", () => {
  it("previews the parsed skill before saving and saves it disabled", async () => {
    renderImport();
    const file = new File(["# x"], "bc.zip", { type: "application/zip" });
    fireEvent.change(screen.getByTestId("skill-file-input"), { target: { files: [file] } });

    await waitFor(() => expect(parseMutate).toHaveBeenCalled());
    expect(parseMutate.mock.calls[0]![0]).toEqual({ filename: "bc.zip", content_base64: btoa("# x") });
    expect(createMutate).not.toHaveBeenCalled();

    expect(await screen.findByText("You are importing someone else's instructions")).toBeInTheDocument();
    expect(screen.getByText("bc/scripts/install.sh")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByDisplayValue("branch-coverage")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save skill"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "branch-coverage", source: "imported_file", enabled: false }),
      expect.anything(),
    );
  });
});
