import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const previewMutateAsync = vi.fn().mockResolvedValue({
  name: "imported-skill",
  description: "Derived from the README",
  type: "convention",
  body: "# Imported\nBody text.",
  source: "imported_file",
  ignored_entries: ["notes.txt", "LICENSE"],
  warnings: ["run.sh — not imported, never run"],
});
const createMutateAsync = vi.fn().mockResolvedValue({ id: "sk9", name: "imported-skill" });

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

const toastSuccess = vi.fn();
vi.mock("../../../../../../lib/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(() => {
  cleanup();
  previewMutateAsync.mockClear();
  createMutateAsync.mockClear();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

function pickFile() {
  const file = new File(["# Imported\nBody text."], "SKILL.md", { type: "text/markdown" });
  // jsdom's Blob#arrayBuffer support varies by version; stub it directly so the
  // test exercises the component's encode step deterministically.
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode("# Imported\nBody text.").buffer),
  });
  const input = screen.getByLabelText("Choose a .md or .zip file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillDrawer", () => {
  it("previews an uploaded file, lists ignored entries and warnings, and creates nothing until Import is confirmed", async () => {
    renderWithIntl(<ImportSkillDrawer onClose={() => {}} />);

    pickFile();

    await waitFor(() => expect(previewMutateAsync).toHaveBeenCalledWith({
      filename: "SKILL.md",
      content_b64: btoa("# Imported\nBody text."),
    }));

    expect(await screen.findByDisplayValue("imported-skill")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("LICENSE")).toBeInTheDocument();
    expect(screen.getByText("run.sh — not imported, never run")).toBeInTheDocument();

    // Nothing is created yet — the preview alone never persists anything.
    expect(createMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Import skill" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "imported-skill",
        description: "Derived from the README",
        type: "convention",
        body: "# Imported\nBody text.",
        source: "imported_file",
        enabled: false,
      }),
    );
  });
});
