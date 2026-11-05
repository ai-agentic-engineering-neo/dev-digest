import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { SkillCardStats, SkillImportPreview, SkillStats, SkillVersionRecord } from "@/lib/types";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

/* Skills Lab (master-detail) — list, URL selection, Config / Preview / Evals /
   Stats / Versions, import. Data hooks, router and AppShell are mocked. */

const updateMutate = vi.fn();
const updateMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
const deleteMutate = vi.fn();
let deletePending = false;
const previewMutateAsync = vi.fn();
const importMutateAsync = vi.fn();
const replace = vi.fn();
let params = new URLSearchParams();
let skills: Skill[] = [];
let cardStats: Record<string, SkillCardStats> = {};
let stats: SkillStats | undefined;
let versions: SkillVersionRecord[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => params,
}));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillUsage: () => ({ data: {} }),
  useSkillCardStats: () => ({ data: cardStats }),
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false, refetch: vi.fn() }),
  // Per-instance pending state, like react-query: `mutate` keeps THIS hook
  // instance pending (the request never settles in tests), so a component that
  // shares one instance between two actions shows the wrong one as busy.
  useUpdateSkill: () => {
    const [pending, setPending] = useState(false);
    return {
      mutate: (...args: unknown[]) => {
        updateMutate(...args);
        setPending(true);
      },
      mutateAsync: updateMutateAsync,
      isPending: pending,
    };
  },
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: deletePending }),
  usePreviewSkillImport: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useImportSkill: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  fileToUpload: async (f: File) => ({ filename: f.name, content_base64: "QUJD" }),
}));

import { SkillsLab } from "./SkillsLab";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills, formatPct, lineDiff, parseTab } from "./helpers";

const RUBRIC: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\n## Correctness\n- Does it work?",
  enabled: true,
  version: 5,
};
const IMPORTED: Skill = {
  id: "s2",
  name: "api-versioning",
  description: "Use when a PR changes a public route.",
  type: "rubric",
  source: "community",
  body: "Breaking changes need **/v2**.",
  enabled: true,
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Undo vi.spyOn stubs (window.confirm) so no test inherits another's stub.
  vi.restoreAllMocks();
  params = new URLSearchParams();
  deletePending = false;
  skills = [];
  cardStats = {};
  stats = undefined;
  versions = [];
});

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

const renderLab = (query = "") => {
  params = new URLSearchParams(query);
  return wrap(<SkillsLab />);
};

describe("SkillsLab — list", () => {
  it("cards show type, source · version and the stats row; nothing is selected by default", () => {
    skills = [RUBRIC, IMPORTED];
    cardStats = { s1: { agents: 3, pull_rate: 0.71, accept_rate: 0.74 } };
    renderLab();
    const card = within(screen.getByTestId("skill-card-pr-quality-rubric"));
    expect(card.getByText("Manual · v5")).toBeInTheDocument();
    expect(card.getByText("3 agents")).toBeInTheDocument();
    expect(card.getByText("71% pull")).toBeInTheDocument();
    expect(card.getByText("74% accept")).toBeInTheDocument();
    const other = within(screen.getByTestId("skill-card-api-versioning"));
    expect(other.getByText("Community · v1")).toBeInTheDocument();
    expect(other.getByText("— pull")).toBeInTheDocument();
    // no default selection → the "Select a skill" panel, no detail header
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run on evals/ })).toBeNull();
    expect(screen.getByTestId("skill-card-pr-quality-rubric").getAttribute("aria-pressed")).toBe("false");
  });

  it("a ?id selects that skill (detail header shown)", () => {
    skills = [RUBRIC, IMPORTED];
    renderLab("id=s1");
    expect(screen.queryByText("Select a skill")).toBeNull();
    expect(screen.getByRole("button", { name: /Run on evals/ })).toBeDisabled();
    expect(screen.getByTestId("skill-card-pr-quality-rubric").getAttribute("aria-pressed")).toBe("true");
  });

  const trash = () =>
    within(screen.getByTestId("skill-card-pr-quality-rubric")).getByRole("button", { name: "Delete skill" });

  it("card trash opens the Delete skill modal; Cancel / Esc close it without deleting", () => {
    skills = [RUBRIC, IMPORTED];
    renderLab("id=s1&tab=stats");
    fireEvent.click(trash());
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/"pr-quality-rubric" will be permanently removed/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus(); // a stray Enter can't delete
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trash());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled(); // the trash click did not select the card
  });

  it("confirming deletes; success closes the modal, toasts and clears the open skill", async () => {
    skills = [RUBRIC, IMPORTED];
    renderLab("id=s1&tab=stats");
    fireEvent.click(trash());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
    act(() => deleteMutate.mock.calls[0]![1].onSuccess());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("Skill deleted")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith("/skills?tab=stats");
  });

  it("while deleting, the modal is locked (no Cancel / ✕ / Esc)", () => {
    skills = [RUBRIC];
    deletePending = true;
    renderLab("id=s1");
    fireEvent.click(trash());
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: /Deleting…/ })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(dialog.queryByRole("button", { name: "Close" })).not.toBeInTheDocument(); // no ✕ while pending
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a failed delete keeps the modal open with the error, and nothing navigates", () => {
    skills = [RUBRIC];
    renderLab("id=s1");
    fireEvent.click(trash());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    act(() => deleteMutate.mock.calls[0]![1].onError(new Error("Skill is in use")));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Skill is in use");
    expect(replace).not.toHaveBeenCalled();
  });

  it("Config Delete opens the same modal", () => {
    skills = [RUBRIC];
    renderLab("id=s1");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(within(screen.getByRole("dialog")).getByText("Delete skill")).toBeInTheDocument();
  });

  it("selecting a card / tab writes the URL; the card toggle does not select", () => {
    skills = [RUBRIC, IMPORTED];
    renderLab("id=s1&tab=stats");
    fireEvent.click(screen.getByTestId("skill-card-api-versioning"));
    expect(replace).toHaveBeenLastCalledWith("/skills?id=s2&tab=stats");
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(replace).toHaveBeenLastCalledWith("/skills?id=s1&tab=versions");
    replace.mockClear();
    fireEvent.click(within(screen.getByTestId("skill-card-api-versioning")).getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s2", patch: { enabled: false } }, expect.anything());
    expect(replace).not.toHaveBeenCalled();
  });

  it("search filters the list", () => {
    skills = [RUBRIC, IMPORTED];
    renderLab();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "route" } });
    expect(screen.queryByTestId("skill-card-pr-quality-rubric")).toBeNull();
    expect(screen.getByTestId("skill-card-api-versioning")).toBeInTheDocument();
  });
});

describe("SkillsLab — Config", () => {
  it("saves only changed fields plus the note; shows unsaved; Discard resets", async () => {
    skills = [RUBRIC];
    updateMutateAsync.mockResolvedValue({ ...RUBRIC, version: 6 });
    renderLab("id=s1");
    expect(screen.queryByText("unsaved")).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull(); // only while dirty
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // Type options are capitalised labels
    expect(screen.getByRole("option", { name: "Rubric" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: RUBRIC.body + "\n- New rule" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("unsaved")).toBeNull();

    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: RUBRIC.body + "\n- New rule" } });
    fireEvent.change(screen.getByLabelText("What changed?"), { target: { value: "Added a rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "s1",
        patch: { body: RUBRIC.body + "\n- New rule", note: "Added a rule" },
      }),
    );
    expect(await screen.findByText("Saved as v6")).toBeInTheDocument();
  });

  it("the header Enabled toggle saves at once without making Save look busy", () => {
    skills = [RUBRIC];
    renderLab("id=s1");
    const header = within(screen.getByRole("heading", { name: "Configuration" }).parentElement!);
    fireEvent.click(header.getByRole("switch", { name: "Enabled" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } }, expect.anything());
    // the toggle request is still in flight — Save must not show "Saving…"
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(header.getByRole("button", { name: "Save" })).toBeInTheDocument();
    // and the form stays usable: an edit enables Save
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Changed." } });
    expect(header.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("guards navigation away from unsaved edits", () => {
    skills = [RUBRIC, IMPORTED];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderLab("id=s1");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Changed." } });
    fireEvent.click(screen.getByTestId("skill-card-api-versioning"));
    expect(confirm).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("create mode: validates the kebab-case name and creates the skill", async () => {
    skills = [RUBRIC];
    createMutateAsync.mockResolvedValue({ ...RUBRIC, id: "s9", name: "no-then-chains" });
    renderLab("new=1");
    expect(screen.getAllByText("New skill").length).toBeGreaterThan(0);
    const create = screen.getByRole("button", { name: "Create skill" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Use on TS." } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "Use await." } });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "no-then-chains" } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "no-then-chains",
        description: "Use on TS.",
        type: "custom",
        body: "Use await.",
      }),
    );
    expect(replace).toHaveBeenLastCalledWith("/skills?id=s9");
  });
});

describe("SkillsLab — Preview / Evals / Stats / Versions", () => {
  it("Preview renders the body; imported skills show the trust notice", () => {
    skills = [IMPORTED];
    renderLab("id=s2&tab=preview");
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("note").textContent).toMatch(/wrapped as untrusted/);
    expect(screen.getByText("/v2")).toBeInTheDocument();
  });

  it("Evals is a placeholder", () => {
    skills = [RUBRIC];
    renderLab("id=s1&tab=evals");
    expect(screen.getByText("Evals are coming")).toBeInTheDocument();
  });

  it("Stats shows the tiles, agents with Open links and category counts", () => {
    skills = [RUBRIC];
    stats = {
      agents: 2,
      pull_rate: 0.71,
      accept_rate: 0.74,
      used_by: [
        { id: "ag1", name: "Security Reviewer" },
        { id: "ag2", name: "Performance Reviewer" },
      ],
      runs_30d: 12,
      findings_30d: 96,
      by_category: [
        { category: "security", count: 60 },
        { category: "bug", count: 36 },
      ],
      window_days: 30,
    };
    renderLab("id=s1&tab=stats");
    expect(screen.getByText("Pull frequency")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getAllByText("74").length).toBeGreaterThan(0); // value + ring
    expect(screen.getByText("96")).toBeInTheDocument();
    const open = screen.getAllByRole("link", { name: "Open" });
    expect(open[0]!.getAttribute("href")).toBe("/agents/ag1?tab=skills");
    expect(screen.getByText("60 · 63%")).toBeInTheDocument();
    expect(screen.getByText(/12 runs with this skill/)).toBeInTheDocument();
  });

  it("Versions: current badge, diff vs current, restore creates a new version", async () => {
    skills = [RUBRIC];
    versions = [
      { skill_id: "s1", version: 2, body: "line a\nline c", note: "Added Tests dimension", created_at: "2026-05-09T10:00:00Z" },
      { skill_id: "s1", version: 1, body: "line a\nline b", note: "Initial version", created_at: "2026-03-02T10:00:00Z" },
    ];
    renderLab("id=s1&tab=versions");
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(within(screen.getByTestId("version-v2")).getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("2026-03-02")).toBeInTheDocument();
    // current has View but no Diff / Restore
    expect(within(screen.getByTestId("version-v2")).queryByRole("button", { name: /Restore/ })).toBeNull();

    // View / Hide shows the version body inline
    const v1 = within(screen.getByTestId("version-v1"));
    fireEvent.click(v1.getByRole("button", { name: /View/ }));
    expect(v1.getByLabelText("Body of v1").textContent).toBe("line a\nline b");
    fireEvent.click(v1.getByRole("button", { name: /Hide/ }));
    expect(v1.queryByLabelText("Body of v1")).toBeNull();

    fireEvent.click(within(screen.getByTestId("version-v1")).getByRole("button", { name: /Diff/ }));
    const diff = screen.getByTestId("skill-diff").textContent ?? "";
    expect(diff).toContain("- line b");
    expect(diff).toContain("+ line c");
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByText("Close", { selector: "button" }));
    expect(screen.queryByTestId("skill-diff")).toBeNull();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(screen.getByTestId("version-v1")).getByRole("button", { name: /Restore/ }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "line a\nline b", note: "Restored from v1" } },
      expect.anything(),
    );
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
    importMutateAsync.mockResolvedValue({ ...IMPORTED });
    const onImported = vi.fn();
    wrap(<ImportSkillModal onClose={vi.fn()} onImported={onImported} />);

    const file = new File(["zip"], "api-versioning.zip", { type: "application/zip" });
    fireEvent.change(screen.getByTestId("skill-import-input"), { target: { files: [file] } });

    await screen.findByText("You are adding someone else's instructions to your agents");
    expect(previewMutateAsync).toHaveBeenCalledWith({ filename: "api-versioning.zip", content_base64: "QUJD" });
    expect(importMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("api-versioning/scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.warnings[0]!)).toBeInTheDocument();

    const save = screen.getByRole("button", { name: /Save imported skill/ });
    expect(save).toBeDisabled(); // description missing
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Use on route changes." } });
    expect(save).toBeEnabled();
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

describe("helpers", () => {
  it("filterSkills matches name, description and type", () => {
    const list = [RUBRIC, { ...RUBRIC, id: "s3", name: "flaky", description: "timers", type: "custom" as const }];
    expect(filterSkills(list, "rubric").map((s) => s.id)).toEqual(["s1"]);
    expect(filterSkills(list, "TIMERS").map((s) => s.id)).toEqual(["s3"]);
    expect(filterSkills(list, " ")).toHaveLength(2);
  });

  it("parseTab / formatPct / lineDiff", () => {
    expect(parseTab("stats")).toBe("stats");
    expect(parseTab("bogus")).toBe("config");
    expect(formatPct(0.745)).toBe("75%");
    expect(formatPct(null)).toBe("—");
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });
});
