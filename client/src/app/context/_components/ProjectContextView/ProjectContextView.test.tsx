import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import contextMessages from "../../../../../messages/en/context.json";
import shellMessages from "../../../../../messages/en/shell.json";
import { ApiError } from "@/lib/api";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => "/context",
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

type RepoRow = { id: string; name: string; clone_path: string | null };
// the shell's active repo: the page reads it and never picks one itself
const shell: { repos: RepoRow[]; repoId: string | null } = { repos: [], repoId: null };
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: shell.repos,
    repoId: shell.repoId,
    activeRepo: shell.repos.find((r) => r.id === shell.repoId) ?? null,
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
  useRepoChangeGuard: (guard: ((proceed: () => void) => void) | null) => {
    repoGuard.current = guard;
  },
}));
const repoGuard: { current: ((proceed: () => void) => void) | null } = { current: null };
const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }) }));

const files: { data: SpecFile[] | undefined; isLoading: boolean; isError: boolean; error: unknown } = { data: [], isLoading: false, isError: false, error: null };
const refetch = vi.fn();
const listedFor = vi.fn();
const refreshMutate = vi.fn();
// four agents, three enabled: coverage for a doc used by 2 of them is 67
const agentRows = { list: [{ enabled: true }, { enabled: true }, { enabled: true }, { enabled: false }] };
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: agentRows.list }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextFiles: (repoId: string | null) => {
    listedFor(repoId);
    return { ...files, refetch };
  },
  useRefreshContext: () => ({ mutate: refreshMutate, isPending: false }),
  useContextFile: (_r: string | null, path: string | null) => {
    fileFor(path);
    return {
      data: path ? { path, sha: "s", ...served.file } : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useSaveContextFile: () => ({ mutate: saveMutate, isPending: false }),
  useResetContextFile: () => ({ mutate: resetMutate, isPending: false }),
}));
const served: { file: { text: string; modified: boolean; updated_at?: string } } = { file: { text: "# Rules\n\nNo db imports from api.", modified: false } };
const fileFor = vi.fn();
const saveMutate = vi.fn();
const resetMutate = vi.fn();

import { ProjectContextView } from "./ProjectContextView";

const doc = (path: string, extra: Partial<SpecFile> = {}): SpecFile => ({ path, kind: "docs", tokens: 120, too_large: false, agent_count: 2, skill_count: 1, agents_using: 2, ...extra });

beforeEach(() => {
  query = "";
  shell.repos = [{ id: "r1", name: "api", clone_path: "/x" }];
  shell.repoId = "r1";
  Object.assign(files, { data: [doc("docs/a.md"), doc("specs/b.md", { kind: "specs", agent_count: 0, skill_count: 0 })], isLoading: false, isError: false, error: null });
});
afterEach(() => {
  cleanup();
  replace.mockReset();
  refetch.mockReset();
  listedFor.mockReset();
  refreshMutate.mockReset();
  fileFor.mockReset();
  saveMutate.mockReset();
  resetMutate.mockReset();
  toastSuccess.mockReset();
  repoGuard.current = null;
  served.file = { text: "# Rules\n\nNo db imports from api.", modified: false };
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages, shell: shellMessages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("lists the documents in the file panel and previews the selected one as Markdown with its token count (AC-8, 9)", () => {
    query = "doc=docs%2Fa.md";
    renderView();
    // file panel: section label, compact rows, footer with the totals
    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByTestId("context-panel-footer")).toHaveTextContent("2 documents · ≈ 240 tokens");
    const rows = screen.getAllByTestId("context-doc-row");
    expect(rows[0]).toHaveTextContent("docs/a.md");
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows[1]).toHaveTextContent("specs/b.md");
    expect(rows[1]).not.toHaveTextContent("tokens");
    expect(screen.getByRole("list", { name: "Documents" })).toContainElement(rows[0]!);
    // document pane: name, token badge, rendered Markdown (a heading), read-only
    expect(screen.getByTestId("context-preview")).toHaveTextContent("≈ 120 tokens");
    expect(screen.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // selecting writes ?doc=
    fireEvent.click(rows[1]!);
    expect(replace).toHaveBeenLastCalledWith("/context?doc=specs%2Fb.md");
  });

  it("offers Preview and Edit pills; Edit swaps the rendered Markdown for a textarea holding the effective text (AC-59)", () => {
    query = "doc=docs%2Fa.md";
    renderView();
    const group = screen.getByRole("group", { name: "Document view" });
    const previewPill = screen.getByRole("button", { name: "Preview" });
    const editPill = screen.getByRole("button", { name: "Edit" });
    expect(group).toContainElement(previewPill);
    expect(previewPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
    fireEvent.click(editPill);
    expect(editPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("# Rules\n\nNo db imports from api.");
  });

  it("shows 'Used by N agents' and the coverage ring (used / enabled agents) for the opened document", () => {
    query = "doc=docs%2Fa.md";
    renderView();
    expect(screen.getByTestId("context-used-by")).toHaveTextContent("Used by 2 agents");
    // 2 of 3 enabled agents → 67, exposed through the ring's accessible name
    expect(screen.getByTestId("context-coverage")).toHaveAttribute("aria-label", "2 of 3 enabled agents use this document");
    expect(screen.getByTestId("context-coverage")).toHaveTextContent("67");
    expect(screen.getByTestId("context-coverage")).toHaveTextContent("Coverage");
  });

  it("offers a toolbar above the list: refresh re-lists, add/folder/upload are present but disabled", () => {
    renderView();
    const toolbar = screen.getByRole("toolbar", { name: "Document tools" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh the list" }));
    expect(refreshMutate).toHaveBeenCalledWith("r1");
    for (const name of ["Add document", "New folder", "Upload document"]) {
      const btn = screen.getByRole("button", { name: `${name} (Not available yet)` });
      expect(toolbar).toContainElement(btn);
      expect(btn.parentElement).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("has no repository selector or refresh button in the header: it lists the shell's active repo", () => {
    shell.repos = [{ id: "r1", name: "api", clone_path: "/x" }, { id: "r2", name: "web", clone_path: "/y" }];
    shell.repoId = "r2";
    renderView();
    expect(screen.queryByLabelText("Repository")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    expect(listedFor).toHaveBeenLastCalledWith("r2");
  });

  it("with no matching file shows an empty state that names the roots (AC-11)", () => {
    files.data = [];
    renderView();
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/specs, docs, insights/)).toBeInTheDocument();
  });

  it("shows an error state with a retry for a failed listing and for a repository without a clone (AC-12)", () => {
    Object.assign(files, { data: undefined, isError: true, error: new ApiError("boom", 502) });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
    cleanup();

    shell.repos = [{ id: "r1", name: "api", clone_path: null }];
    renderView();
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
    // nothing is requested for a repo without a clone
    expect(listedFor).toHaveBeenLastCalledWith(null);
  });

  describe("local overrides (AC-60 to AC-69)", () => {
    const openEditor = async () => {
      query = "doc=docs%2Fa.md";
      const user = userEvent.setup();
      renderView();
      await user.click(screen.getByRole("button", { name: "Edit" }));
      return { user, box: screen.getByRole("textbox", { name: "Document text" }) };
    };

    it("saves with one PUT, toasts, and stays in Edit; Save is disabled until the text changes (AC-60, 62, D9)", async () => {
      saveMutate.mockImplementation((_v, opts) => opts.onSuccess());
      const { user, box } = await openEditor();
      const save = screen.getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      await user.type(box, " more");
      await user.click(save);
      expect(saveMutate).toHaveBeenCalledTimes(1);
      expect(saveMutate.mock.calls[0]![0]).toEqual({ repoId: "r1", path: "docs/a.md", text: "# Rules\n\nNo db imports from api. more" });
      expect(toastSuccess).toHaveBeenCalledWith("Saved as a local override");
      expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    });

    it("a failed save keeps the unsaved text and shows no success toast (AC-63)", async () => {
      // the global mutation toast reports the error; onSuccess is never called
      const { user, box } = await openEditor();
      await user.type(box, "!");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(saveMutate).toHaveBeenCalledTimes(1);
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(box).toHaveValue("# Rules\n\nNo db imports from api.!");
    });

    it("Ctrl/Cmd+S saves in Edit mode and is suppressed; nothing when unchanged; not prevented in Preview (AC-64, EC-30)", async () => {
      query = "doc=docs%2Fa.md";
      const user = userEvent.setup();
      renderView();
      const inPreview = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
      window.dispatchEvent(inPreview);
      expect(inPreview.defaultPrevented).toBe(false);
      expect(saveMutate).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const unchanged = new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true, bubbles: true });
      window.dispatchEvent(unchanged);
      expect(unchanged.defaultPrevented).toBe(true);
      expect(saveMutate).not.toHaveBeenCalled();

      await user.type(screen.getByRole("textbox", { name: "Document text" }), "x");
      const changed = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
      window.dispatchEvent(changed);
      expect(changed.defaultPrevented).toBe(true);
      expect(saveMutate).toHaveBeenCalledTimes(1);
    });

    it("a modified document shows the badge, the row marker and Reset; Reset asks first, then DELETEs (AC-65, 66)", async () => {
      served.file = { text: "mine", modified: true, updated_at: "2026-10-21T10:00:00Z" };
      files.data = [doc("docs/a.md", { modified: true, tokens: 77 }), doc("specs/b.md", { kind: "specs" })];
      resetMutate.mockImplementation((_v, opts) => opts.onSuccess());
      query = "doc=docs%2Fa.md";
      const user = userEvent.setup();
      renderView();
      expect(screen.getAllByText("Modified locally").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("img", { name: "Modified locally" })).toHaveLength(1);
      // the opened document's head carries its token badge (D8); rows show none
      expect(screen.getAllByText("≈ 77 tokens")).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Reset to repository version" }));
      expect(resetMutate).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(resetMutate).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Reset to repository version" }));
      await user.click(screen.getByRole("button", { name: "Reset" }));
      expect(resetMutate.mock.calls[0]![0]).toMatchObject({ repoId: "r1", path: "docs/a.md" });
      expect(toastSuccess).toHaveBeenCalledWith("Back to the repository version");
    });

    it("an unmodified document has no badge, marker or Reset", () => {
      query = "doc=docs%2Fa.md";
      renderView();
      expect(screen.queryByText("Modified locally")).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "Modified locally" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset to repository version" })).not.toBeInTheDocument();
    });

    it("unsaved text: selecting another document or leaving Edit asks; Cancel keeps it, Discard goes on (AC-67)", async () => {
      const { user, box } = await openEditor();
      await user.type(box, " draft");
      // document change
      await user.click(screen.getAllByTestId("context-doc-row")[1]!);
      expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("# Rules\n\nNo db imports from api. draft");
      await user.click(screen.getAllByTestId("context-doc-row")[1]!);
      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(replace).toHaveBeenLastCalledWith("/context?doc=specs%2Fb.md");

    });

    it("leaving Edit with unsaved text asks; Discard returns to Preview with the old text (AC-67)", async () => {
      const { user, box } = await openEditor();
      await user.type(box, " draft");
      await user.click(screen.getByRole("button", { name: "Preview" }));
      expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("textbox", { name: "Document text" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Preview" }));
      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Rules" })).toBeInTheDocument();
    });

    it("registers a repo-change guard only while there are unsaved changes; the change waits for Discard (AC-67)", async () => {
      const { user, box } = await openEditor();
      expect(repoGuard.current).toBeNull();
      await user.type(box, "!");
      expect(repoGuard.current).not.toBeNull();
      const proceed = vi.fn();
      act(() => repoGuard.current!(proceed));
      expect(proceed).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Discard" }));
      expect(proceed).toHaveBeenCalledTimes(1);
    });

    it("a too-large document names the reason in both pills and requests no text (AC-69, D7)", async () => {
      files.data = [doc("docs/a.md", { too_large: true, tokens: null })];
      query = "doc=docs%2Fa.md";
      const user = userEvent.setup();
      renderView();
      expect(fileFor).toHaveBeenLastCalledWith(null);
      expect(screen.getByTestId("context-not-editable")).toHaveTextContent("larger than 200,000 characters");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      expect(screen.getByTestId("context-not-editable")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });
});
