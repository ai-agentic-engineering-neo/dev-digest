import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/skills.json";
import type { SkillImportPreview } from "../../../../../lib/hooks/skills";

const { importMutateSpy } = vi.hoisted(() => ({ importMutateSpy: vi.fn() }));

const PREVIEW: SkillImportPreview = {
  name: "No hardcoded secrets",
  description: "Flag any hardcoded secret or credential",
  type: "security",
  body: "# Rule\nFlag any hardcoded API key, token, or password literal.",
  source: "imported_url",
  evidence_files: ["security-notes.md"],
};

vi.mock("../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({
    isPending: false,
    isError: false,
    mutate: (input: { filename: string; content_base64: string }, opts?: { onSuccess?: (d: SkillImportPreview) => void }) => {
      importMutateSpy(input);
      opts?.onSuccess?.(PREVIEW);
    },
  }),
}));

import { ImportSkillPicker } from "./ImportSkillPicker";

/** Minimal FileReader stand-in: real jsdom FileReader support for
 *  readAsDataURL is inconsistent across versions, and the real base64 content
 *  isn't what this test cares about — only that the component strips the
 *  `data:...;base64,` prefix before posting it. */
class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    this.result = "data:text/markdown;base64,Zm9v";
    queueMicrotask(() => this.onload?.());
  }
}

afterEach(cleanup);

beforeEach(() => {
  importMutateSpy.mockClear();
  vi.stubGlobal("FileReader", FakeFileReader);
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("ImportSkillPicker", () => {
  it("reads the chosen file, base64-encodes it, and hands the preview to onImported", async () => {
    const onImported = vi.fn();
    renderWithIntl(<ImportSkillPicker onImported={onImported} />);

    const file = new File(["# Rule\nflag secrets"], "security.md", { type: "text/markdown" });
    const input = screen.getByLabelText("Choose file…") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(PREVIEW));
    expect(importMutateSpy).toHaveBeenCalledWith({ filename: "security.md", content_base64: "Zm9v" });
  });
});
