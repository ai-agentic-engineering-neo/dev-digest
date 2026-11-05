import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { SkillImportPreview } from "@/lib/types";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

/* Component-level tests for the Skills page pieces (card, preview drawer,
   editor, import). Data hooks are mocked — no network / query client. */

const updateMutate = vi.fn();
const createMutateAsync = vi.fn();
const previewMutateAsync = vi.fn();
const importMutateAsync = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, mutateAsync: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  usePreviewSkillImport: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useImportSkill: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  fileToUpload: async (f: File) => ({ filename: f.name, content_base64: "QUJD" }),
}));

import { SkillCard } from "./_components/SkillCard";
import { SkillPreviewDrawer } from "./_components/SkillPreviewDrawer";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SKILL: Skill = {
  id: "s1",
  name: "api-versioning",
  description: "Use when a PR changes a public route.",
  type: "rubric",
  source: "community",
  body: "# Rule\nBreaking changes need **/v2**.",
  enabled: true,
  version: 3,
};

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders name, type, description, imported marker, usage; toggle doesn't open the card", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    wrap(<SkillCard skill={SKILL} usedBy={2} onClick={onClick} onToggle={onToggle} />);
    expect(screen.getByText("api-versioning")).toBeTruthy();
    expect(screen.getByText("rubric")).toBeTruthy();
    expect(screen.getByText("imported")).toBeTruthy();
    expect(screen.getByText("2 agents")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("api-versioning"));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("SkillPreviewDrawer", () => {
  it("shows the trust notice for imported skills and the rendered body", () => {
    wrap(<SkillPreviewDrawer skill={SKILL} usedBy={0} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByRole("note").textContent).toContain("someone else's instructions");
    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("/v2").tagName).toBe("STRONG");
  });

  it("has no trust notice for manual skills", () => {
    wrap(<SkillPreviewDrawer skill={{ ...SKILL, source: "manual" }} usedBy={0} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("SkillEditorModal", () => {
  it("shows the directive hint, blocks invalid names, creates a skill", async () => {
    createMutateAsync.mockResolvedValue({ ...SKILL, source: "manual" });
    const onClose = vi.fn();
    wrap(<SkillEditorModal onClose={onClose} />);
    expect(screen.getByText(/write it as a directive/)).toBeTruthy();

    const create = screen.getByRole("button", { name: /Create skill/ }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Use when X." } });
    fireEvent.change(screen.getByPlaceholderText(/Describe what to check/), { target: { value: "Rule body" } });
    expect(create.disabled).toBe(true); // not kebab-case

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "good-name" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith({
      name: "good-name",
      description: "Use when X.",
      type: "custom",
      body: "Rule body",
    });
  });

  it("edit saves only changed fields", async () => {
    updateMutate.mockResolvedValue({ ...SKILL, version: 4 });
    const onClose = vi.fn();
    wrap(<SkillEditorModal skill={SKILL} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "New directive." } });
    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { description: "New directive." } });
  });
});

describe("ImportSkillModal", () => {
  const PREVIEW: SkillImportPreview = {
    name: "api-versioning",
    description: "",
    type: "rubric",
    body: "Breaking changes need /v2.",
    files: [
      { path: "api-versioning/SKILL.md", size: 120, status: "used", reason: "skill entry" },
      { path: "api-versioning/scripts/run.sh", size: 40, status: "ignored", reason: "executable / script — never run or read" },
    ],
    warnings: ["1 file(s) were ignored — only markdown/text is read; nothing from the archive is executed."],
  };

  it("previews first (nothing saved), requires a description, then confirms the import", async () => {
    previewMutateAsync.mockResolvedValue(PREVIEW);
    importMutateAsync.mockResolvedValue({ ...SKILL });
    const onImported = vi.fn();
    wrap(<ImportSkillModal onClose={vi.fn()} onImported={onImported} />);

    const file = new File(["zip"], "api-versioning.zip", { type: "application/zip" });
    fireEvent.change(screen.getByTestId("skill-import-input"), { target: { files: [file] } });

    await screen.findByText("You are adding someone else's instructions to your agents");
    expect(previewMutateAsync).toHaveBeenCalledWith({ filename: "api-versioning.zip", content_base64: "QUJD" });
    expect(importMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("api-versioning/scripts/run.sh")).toBeTruthy();
    expect(screen.getByText("ignored")).toBeTruthy();
    expect(screen.getByText(PREVIEW.warnings[0]!)).toBeTruthy();

    const save = screen.getByRole("button", { name: /Save imported skill/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // description missing
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Use on route changes." } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(importMutateAsync).toHaveBeenCalledWith({
      filename: "api-versioning.zip",
      content_base64: "QUJD",
      name: "api-versioning",
      description: "Use on route changes.",
      type: "rubric",
    });
  });

  it("shows the server error when the file can't be parsed", async () => {
    previewMutateAsync.mockRejectedValue(new Error("Archive must contain SKILL.md"));
    wrap(<ImportSkillModal onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-import-input"), {
      target: { files: [new File(["x"], "x.zip")] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("SKILL.md");
  });
});

describe("filterSkills", () => {
  it("matches name, description and type", () => {
    const list = [SKILL, { ...SKILL, id: "s2", name: "flaky", description: "timers", type: "custom" as const }];
    expect(filterSkills(list, "rubric").map((s) => s.id)).toEqual(["s1"]);
    expect(filterSkills(list, "TIMERS").map((s) => s.id)).toEqual(["s2"]);
    expect(filterSkills(list, " ")).toHaveLength(2);
  });
});
