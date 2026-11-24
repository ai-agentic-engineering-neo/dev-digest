import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const previewAsync = vi.fn();
const createAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useImportPreview: () => ({ mutateAsync: previewAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createAsync, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

const PREVIEW = {
  name: "imported-skill",
  description: "Apply when X",
  type: "convention",
  body: "# Imported\n\nDo the thing.",
  ignored_files: ["scripts/run.sh"],
  warnings: ["Frontmatter had no type"],
};

beforeEach(() => {
  previewAsync.mockReset().mockResolvedValue(PREVIEW);
  createAsync.mockReset().mockResolvedValue({ id: "n" });
});
afterEach(cleanup);

function upload() {
  const file = new File(["# hi"], "SKILL.md", { type: "text/markdown" });
  fireEvent.change(screen.getByLabelText("Choose a .md or .zip file"), { target: { files: [file] } });
}

describe("ImportSkillModal", () => {
  it("uploads, previews, then saves with source imported_file", async () => {
    const onClose = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillModal onClose={onClose} />
      </NextIntlClientProvider>,
    );
    // nothing to save before a preview exists
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();

    upload();
    expect(await screen.findByText("Ignored files (not executed)")).toBeInTheDocument();
    expect(screen.getByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText("Frontmatter had no type")).toBeInTheDocument();
    expect(screen.getByText("Do the thing.")).toBeInTheDocument();
    expect(screen.getByText(/someone else's instructions/)).toBeInTheDocument();
    expect(previewAsync).toHaveBeenCalledWith({ filename: "SKILL.md", content_base64: expect.any(String) });
    expect(createAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByDisplayValue("imported-skill"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createAsync).toHaveBeenCalledWith({
      name: "renamed",
      description: "Apply when X",
      type: "convention",
      body: PREVIEW.body,
      source: "imported_file",
    });
  });

  it("shows an error when the preview fails", async () => {
    previewAsync.mockRejectedValue(new Error("no .md in archive"));
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillModal onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
    upload();
    expect(await screen.findByText(/Import failed: no .md in archive/)).toBeInTheDocument();
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();
  });

  function renderModal() {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ImportSkillModal onClose={vi.fn()} />
      </NextIntlClientProvider>,
    );
  }

  it("accepts a file dropped on the zone and shows the same preview, saving nothing", async () => {
    renderModal();
    const file = new File(["# hi"], "SKILL.md", { type: "text/markdown" });
    fireEvent.drop(screen.getByTestId("skill-drop-zone"), { dataTransfer: { files: [file] } });
    expect(await screen.findByText("Ignored files (not executed)")).toBeInTheDocument();
    expect(previewAsync).toHaveBeenCalledWith({ filename: "SKILL.md", content_base64: expect.any(String) });
    expect(createAsync).not.toHaveBeenCalled();
  });

  it("rejects a dropped file with an unsupported extension without calling the server", async () => {
    renderModal();
    const file = new File(["x"], "run.sh", { type: "text/x-sh" });
    fireEvent.drop(screen.getByTestId("skill-drop-zone"), { dataTransfer: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only .md and .zip files are supported.");
    expect(previewAsync).not.toHaveBeenCalled();
  });

  it("prevents the browser default on dragover so a drop is allowed", () => {
    renderModal();
    const notPrevented = fireEvent.dragOver(screen.getByTestId("skill-drop-zone"));
    expect(notPrevented).toBe(false); // false => preventDefault() was called
  });
});
