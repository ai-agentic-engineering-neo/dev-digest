import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import * as hooks from "@/lib/hooks/skills";
import { ImportSkillDrawer } from "./ImportSkillDrawer";

// The FileReader round-trip is exercised by nothing here — this test is about
// the preview-then-confirm CONTRACT, not about reading bytes off disk.
vi.mock("./helpers", () => ({
  readFileAsBase64: vi.fn().mockResolvedValue("IyBSdWxlCkNoZWNrIGNvdmVyYWdlLg=="),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const PREVIEW: SkillImportPreview = {
  name: "test-coverage-nudge",
  description: "Flags untested branches.",
  body: "# Rule\nCheck coverage.",
  source_path: null,
  ignored_entries: 0,
  candidates: null,
  collides_with: null,
};

/** Wires `useImportSkillPreview` so its `data` reflects the LAST resolved
 *  mutateAsync call on the next render — good enough to drive the component
 *  through pick → preview → confirm without a real QueryClient. */
function mockHooks(preview: SkillImportPreview, createMutate = vi.fn()) {
  let currentData: SkillImportPreview | undefined;
  const parseMutateAsync = vi.fn(async () => {
    currentData = preview;
    return preview;
  });
  vi.spyOn(hooks, "useImportSkillPreview").mockImplementation(
    () =>
      ({
        mutateAsync: parseMutateAsync,
        get data() {
          return currentData;
        },
        isPending: false,
      }) as unknown as ReturnType<typeof hooks.useImportSkillPreview>,
  );
  vi.spyOn(hooks, "useCreateSkill").mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useCreateSkill>);
  return { parseMutateAsync, createMutate };
}

function confirmButton() {
  return screen.getByRole("button", { name: "Import skill" });
}

/** Simulate picking a file and wait for the preview to settle — the Confirm
 *  button flipping from disabled to enabled is the one unambiguous DOM signal
 *  that the mutateAsync round-trip (and the re-render reading its `data`) is done. */
async function pickFile() {
  const file = new File(["# Rule\nCheck coverage."], "test-coverage-nudge.md", {
    type: "text/markdown",
  });
  const input = screen.getByLabelText("Skill file");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(confirmButton()).not.toBeDisabled());
}

describe("ImportSkillDrawer", () => {
  it("shows no preview and a disabled confirm button before any file is picked", () => {
    mockHooks(PREVIEW);
    renderWithIntl(<ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />);
    expect(confirmButton()).toBeDisabled();
  });

  it("shows the parsed preview after picking a file, WITHOUT calling create — nothing is saved yet", async () => {
    const { createMutate } = mockHooks(PREVIEW);
    const { container } = renderWithIntl(
      <ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await pickFile();

    // Raw textContent — unlike getByText, this is not whitespace-normalized.
    expect(container.textContent).toContain("# Rule\nCheck coverage.");
    expect(container.textContent).toContain("No other entries in this upload");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("only calls create on explicit confirm, with the parsed fields and enabled:false", async () => {
    const { createMutate } = mockHooks(PREVIEW);
    renderWithIntl(<ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />);

    await pickFile();
    fireEvent.click(confirmButton());

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0]!;
    expect(payload).toMatchObject({
      name: "test-coverage-nudge",
      description: "Flags untested branches.",
      type: "custom",
      body: "# Rule\nCheck coverage.",
      source: "imported_url",
      // Imported skills always land disabled — a "needs vetting" badge until a
      // human reads the body and flips it on.
      enabled: false,
    });
  });

  it("surfaces a name collision instead of silently overwriting the existing skill", async () => {
    mockHooks({ ...PREVIEW, collides_with: "test-coverage-nudge" });
    const { container } = renderWithIntl(
      <ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await pickFile();
    expect(container.textContent).toContain(
      'A skill named "test-coverage-nudge" already exists — rename it below before importing.',
    );
  });

  it("reports how many archive entries were NOT read", async () => {
    mockHooks({ ...PREVIEW, source_path: "SKILL.md", ignored_entries: 2 });
    const { container } = renderWithIntl(
      <ImportSkillDrawer onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await pickFile();
    expect(container.textContent).toContain("2 other entries were not read");
    expect(container.textContent).toContain("Read from SKILL.md");
  });
});
