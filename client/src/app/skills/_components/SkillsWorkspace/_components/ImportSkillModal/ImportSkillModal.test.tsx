import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "flaky-tests",
  description: "Use when tests touch time.",
  type: "rubric",
  body: "# Flaky tests",
  core_path: "flaky-tests/SKILL.md",
  ignored_files: [{ path: "flaky-tests/scripts/detect-flaky.sh", reason: "executable" }],
  warnings: ["1 executable file(s) were not read or run."],
};
const parseMutate = vi.fn((_input, opts) => opts.onSuccess(PREVIEW));
const createMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: parseMutate, isPending: false, error: null, reset: vi.fn() }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false, error: null, reset: vi.fn() }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  parseMutate.mockClear();
  createMutate.mockClear();
});

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ImportSkillModal onClose={() => {}} onImported={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillModal", () => {
  it("previews the parsed core with the trust warning and ignored executables before saving", async () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "Save as disabled skill" })).not.toBeInTheDocument();

    const file = new File(["zip-bytes"], "flaky-tests.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Skill file"), { target: { files: [file] } });

    await waitFor(() => expect(parseMutate).toHaveBeenCalled());
    expect(parseMutate.mock.calls[0]![0]).toMatchObject({ filename: "flaky-tests.zip" });
    expect(createMutate).not.toHaveBeenCalled();

    expect(screen.getByRole("note")).toHaveTextContent(/someone else's instructions/);
    expect(screen.getByText("flaky-tests/scripts/detect-flaky.sh")).toBeInTheDocument();
    expect(screen.getByText("executable — not processed")).toBeInTheDocument();
    expect(screen.getByDisplayValue("flaky-tests")).toBeInTheDocument();
  });

  it("confirm creates the skill as an import (saved disabled server-side)", async () => {
    renderModal();
    const file = new File(["# x"], "flaky.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Skill file"), { target: { files: [file] } });
    const save = await screen.findByRole("button", { name: "Save as disabled skill" });
    fireEvent.click(save);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "flaky-tests", source: "imported", body: "# Flaky tests" }),
      expect.anything(),
    );
  });
});
