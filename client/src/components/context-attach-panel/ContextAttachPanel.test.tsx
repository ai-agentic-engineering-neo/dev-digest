import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, SpecFile } from "@devdigest/shared";
import contextMessages from "../../../messages/en/context.json";
import agentsMessages from "../../../messages/en/agents.json";
import skillsMessages from "../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const REPOS = [
  { id: "r1", name: "api", clone_path: "/x" },
  { id: "r2", name: "web", clone_path: "/y" },
];
const repoState: { repos: typeof REPOS; repoId: string | null } = { repos: REPOS, repoId: "r2" };
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: repoState.repos, repoId: repoState.repoId, activeRepo: null, reposLoaded: true, setRepoId: vi.fn() }),
}));

const file = (path: string, extra: Partial<SpecFile> = {}): SpecFile => ({ path, kind: "docs", tokens: 100, too_large: false, agent_count: 0, skill_count: 0, ...extra });
const state: { files: SpecFile[]; attachments: ContextAttachment[] } = { files: [], attachments: [] };
const served: { file: { modified: boolean; updated_at?: string } } = { file: { modified: false } };
const seenRepo: (string | null | undefined)[] = [];
const mutate = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useContextFiles: (repoId: string | null) => {
    seenRepo.push(repoId);
    return { data: state.files, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useContextAttachments: () => ({ data: state.attachments, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetContextAttachments: () => ({ mutate, isPending: false }),
  useContextFile: () => ({ data: { path: "docs/a.md", sha: "s", text: "# Heading\n\nbody", ...served.file }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { ContextAttachPanel } from "./ContextAttachPanel";

beforeEach(() => {
  state.files = [file("docs/a.md"), file("docs/b.md", { tokens: 250 }), file("specs/c.md", { kind: "specs" }), file("docs/huge.md", { too_large: true, tokens: null })];
  state.attachments = [
    { path: "specs/c.md", order: 0, missing: false, too_large: false },
    { path: "docs/gone.md", order: 1, missing: true, too_large: false },
  ];
  repoState.repoId = "r2";
  seenRepo.length = 0;
  served.file = { modified: false };
});
afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderPanel(kind: "agent" | "skill") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages, agents: agentsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <ContextAttachPanel owner={{ kind, id: "o1", name: "Owner" }} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextAttachPanel (agent)", () => {
  it("defaults to the active repository, lists attached rows first with badges, a count and the token total (AC-20, 22, 25)", () => {
    renderPanel("agent");
    // several repos: the shell's active one (r2) is used
    expect(seenRepo.at(-1)).toBe("r2");
    expect(screen.getByLabelText("Repository")).toHaveValue("r2");
    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 attached")).toBeInTheDocument();
    const rows = screen.getAllByTestId("context-doc-row");
    // attach rows show the file name and its folder as separate cells
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("c.md"),
      expect.stringContaining("gone.md"),
      expect.stringContaining("a.md"),
      expect.stringContaining("b.md"),
      expect.stringContaining("huge.md"),
    ]);
    expect(within(rows[0]!).getByText("specs/")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("c.md")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("missing")).toBeInTheDocument();
    expect(within(rows[4]!).getByText("too large")).toBeInTheDocument();
    // total of the checked, listed documents only (the missing path adds nothing)
    expect(within(screen.getByTestId("context-panel-total")).getByText("≈ 100 tokens")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("checking, unchecking and reordering save the whole ordered list; a too large file cannot be checked (AC-23, EC-17)", () => {
    renderPanel("agent");
    const rows = screen.getAllByTestId("context-doc-row");
    fireEvent.click(within(rows[2]!).getByRole("checkbox"));
    expect(mutate).toHaveBeenLastCalledWith({ id: "o1", repoId: "r2", paths: ["specs/c.md", "docs/gone.md", "docs/a.md"] }, expect.anything());
    fireEvent.click(within(rows[0]!).getByRole("checkbox"));
    expect(mutate).toHaveBeenLastCalledWith({ id: "o1", repoId: "r2", paths: ["docs/gone.md"] }, expect.anything());
    fireEvent.click(screen.getByLabelText("Move specs/c.md down"));
    expect(mutate).toHaveBeenLastCalledWith({ id: "o1", repoId: "r2", paths: ["docs/gone.md", "specs/c.md"] }, expect.anything());
    mutate.mockClear();
    fireEvent.click(within(rows[4]!).getByRole("checkbox"));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("filters the rows and opens a preview of the document text (AC-20)", () => {
    renderPanel("agent");
    fireEvent.change(screen.getByLabelText("Filter documents"), { target: { value: "specs" } });
    expect(screen.getAllByTestId("context-doc-row")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/c.md" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    // not edited locally: no badge
    expect(within(screen.getByRole("dialog")).queryByText("Modified locally")).not.toBeInTheDocument();
  });

  it("the preview of a locally modified document carries the Modified locally badge (AC-68)", () => {
    served.file = { modified: true, updated_at: "2026-10-21T10:00:00Z" };
    renderPanel("agent");
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/c.md" }));
    expect(within(screen.getByRole("dialog")).getByText("Modified locally")).toBeInTheDocument();
  });

  it("warns, naming the cap and the total, while the checked tokens are above the prompt cap (AC-24)", () => {
    state.files = [file("docs/a.md", { tokens: 20_000 }), file("docs/b.md", { tokens: 5_000 })];
    state.attachments = [
      { path: "docs/a.md", order: 0, missing: false, too_large: false },
      { path: "docs/b.md", order: 1, missing: false, too_large: false },
    ];
    renderPanel("agent");
    expect(screen.getByRole("alert")).toHaveTextContent("≈ 25000 tokens, above the 24000-token limit");
  });
});

describe("ContextAttachPanel (skill)", () => {
  it("shows the skill title, the inherit hint, an 'N attached' badge and the serialised block (AC-21)", () => {
    renderPanel("skill");
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText(/Agents that use this skill inherit these documents/)).toBeInTheDocument();
    expect(screen.getByText("2 attached")).toBeInTheDocument();
    expect(screen.getByTestId("skill-context-block").textContent).toBe("## Project context\nspecs/c.md\ndocs/gone.md");
  });

  it("with a single repository the selector is hidden and that repository is used (AC-22)", () => {
    repoState.repos = [REPOS[0]!];
    repoState.repoId = null;
    renderPanel("skill");
    expect(seenRepo.at(-1)).toBe("r1");
    expect(screen.queryByLabelText("Repository")).not.toBeInTheDocument();
    repoState.repos = REPOS;
  });
});
