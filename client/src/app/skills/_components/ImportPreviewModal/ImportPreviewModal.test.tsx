import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import type { CreateSkillInput, SkillImportPreview } from "@devdigest/shared";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import { ImportPreviewModal } from "./ImportPreviewModal";

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-hunter",
  description: "Flag tests that depend on time or order.",
  type: "custom",
  body: "## Flaky tests\n\nLook for **sleep** calls.",
  source: "imported_file",
  source_ref: "flaky-test-hunter.zip",
  included_files: ["flaky-test-hunter/SKILL.md"],
  ignored_files: [
    { path: "flaky-test-hunter/scripts/detect.sh", reason: "executable" },
    { path: "flaky-test-hunter/references/notes.md", reason: "reference_doc" },
    { path: "flaky-test-hunter/blob.bin", reason: "weird_reason" },
  ],
  warnings: ["Removed 1 HTML comment (hidden text)"],
};

let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  nav.push.mockReset();
  api = mockFetch({
    "POST /skills": (req) => makeSkill({ ...(req.body as CreateSkillInput), id: "new1", enabled: false, version: 1 }),
  });
});
afterEach(cleanup);

describe("ImportPreviewModal", () => {
  it("shows the source, trust notice, rendered body, included + ignored files with reasons, and warnings", () => {
    renderWithProviders(<ImportPreviewModal preview={PREVIEW} onClose={() => {}} />);
    expect(screen.getByText("Review before importing")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-hunter.zip")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Imported skills are saved disabled");
    expect(screen.getByText("sleep").tagName).toBe("STRONG");
    expect(screen.getByText("flaky-test-hunter/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-hunter/scripts/detect.sh — executable, never read")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-hunter/references/notes.md — reference doc, not imported")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-hunter/blob.bin — weird_reason")).toBeInTheDocument();
    expect(screen.getByText("Removed 1 HTML comment (hidden text)")).toBeInTheDocument();
  });

  it("the Raw toggle shows the unrendered Markdown", async () => {
    const { user } = renderWithProviders(<ImportPreviewModal preview={PREVIEW} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByText(/Look for \*\*sleep\*\* calls\./)).toBeInTheDocument();
  });

  it("Confirm POSTs the edited meta with source + source_ref, then opens the editor", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<ImportPreviewModal preview={PREVIEW} onClose={onClose} />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "flaky-hunter");
    await user.selectOptions(screen.getByRole("combobox"), "rubric");
    await user.click(screen.getByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(api.requests("POST", "/skills")).toHaveLength(1));
    expect(api.requests("POST", "/skills")[0]!.body).toEqual({
      name: "flaky-hunter",
      description: "Flag tests that depend on time or order.",
      type: "rubric",
      body: PREVIEW.body,
      source: "imported_file",
      source_ref: "flaky-test-hunter.zip",
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/skills/new1?tab=config"));
    expect(onClose).toHaveBeenCalled();
  });

  it("an invalid name blocks the import", async () => {
    const { user } = renderWithProviders(<ImportPreviewModal preview={PREVIEW} onClose={() => {}} />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Flaky Hunter");
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });
});
