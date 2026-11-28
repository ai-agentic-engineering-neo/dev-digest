import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-smells",
  description: "Flag tests that sleep or read the real clock.",
  type: "rubric",
  body: "# Flaky tests\n\n- Flag sleeps.",
  source_file: "flaky-test-smells/SKILL.md",
  skipped_files: ["flaky-test-smells/scripts/install.sh"],
  warnings: ["1 other file(s) in the archive were ignored — they are never read or run."],
};

const confirm = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useImportPreview: () => ({
    mutate: (_f: File, opts: { onSuccess: (p: SkillImportPreview) => void }) => opts.onSuccess(PREVIEW),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useConfirmImport: () => ({ mutate: confirm, isPending: false, error: null, reset: vi.fn() }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  confirm.mockReset();
});

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillModal onClose={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  const input = screen.getByTestId("skill-import-file");
  fireEvent.change(input, { target: { files: [new File(["x"], "flaky.zip")] } });
}

describe("ImportSkillModal", () => {
  it("shows the preview: trust warning, body, and skipped (never run) files", () => {
    renderModal();
    expect(screen.getByText("Review before saving")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/someone else’s instructions/);
    expect(screen.getByText("Flaky tests")).toBeInTheDocument();
    expect(screen.getByText("Skipped (not read, not run)")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-smells/scripts/install.sh")).toBeInTheDocument();
  });

  it("cannot save until the user confirms trust", () => {
    renderModal();
    const save = screen.getByRole("button", { name: /Save skill/ });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: "flaky-test-smells", trusted: true, body: PREVIEW.body }),
      expect.anything(),
    );
  });
});
