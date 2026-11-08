import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../../messages/en/context.json";
import type {
  ContextDocList,
  DevdigestCopyResult,
  DevdigestDoc,
  DevdigestDocList,
} from "@/lib/types";

/* Project Context page: hooks, AppShell, repo context, navigation and the three route-local
   children are mocked; the children are stubs that expose their callbacks as buttons. */

const DOCS: ContextDocList["docs"] = [
  { path: "README.md", source: "readme", tokens: 120, attached_agents: 0 },
  { path: "docs/a.md", source: "docs", tokens: 820, attached_agents: 2 },
  { path: "server/specs/auth.md", source: "specs", tokens: 300, attached_agents: 1 },
];
const READY: ContextDocList = { repo_id: "r1", state: { status: "ready" }, docs: DOCS };
const DD: DevdigestDocList = {
  repo_id: "r1",
  docs: [],
  limit: 200,
  synced_at: "2026-11-01T10:00:00.000Z",
  ignored_repo_paths: 0,
};

let list: ContextDocList | undefined = READY;
let dd: DevdigestDocList | undefined = DD;
let ddState = { isError: false, isFetching: false };
const ddRefetch = vi.fn();
let search = new URLSearchParams();
let crumbs: { label: string; mono?: boolean }[] = [];
let lastToolbar: { targetFolder: string } | undefined;
const replace = vi.fn();
const resyncStart = vi.fn();

vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
  useContextResync: () => ({ start: resyncStart, busy: false }),
}));
vi.mock("@/lib/hooks/devdigest-docs", () => ({
  useDevdigestDocs: () => ({ data: dd, ...ddState, refetch: ddRefetch }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string; mono?: boolean }[] }) => {
    crumbs = crumb;
    return <div>{children}</div>;
  },
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

const created = { path: ".devdigest/specs/a.md" } as DevdigestDoc;
const copied = (c: boolean): DevdigestCopyResult => ({ created: c, doc: created });

vi.mock("../DocTree", () => ({
  DocTree: (p: {
    docs: { path: string }[];
    onSelectDoc: (path: string) => void;
    onSelectFolder: (f: string) => void;
  }) => (
    <div data-testid="tree">
      {p.docs.map((d) => (
        <button key={d.path} onClick={() => p.onSelectDoc(d.path)}>
          {d.path}
        </button>
      ))}
      <button onClick={() => p.onSelectFolder("drafts")}>folder drafts</button>
    </div>
  ),
}));
vi.mock("../ContextToolbar", () => ({
  ContextToolbar: (p: { targetFolder: string; onFileCreated: (d: DevdigestDoc) => void }) => {
    lastToolbar = p;
    return (
      <div>
        <button onClick={() => p.onFileCreated(created)}>toolbar create</button>
        <button>Resync repo docs</button>
      </div>
    );
  },
}));
vi.mock("../DocPane", () => ({
  DocPane: (p: {
    doc: { path: string };
    devdigestId: string | null;
    onCopied: (r: DevdigestCopyResult) => void;
    onDirtyChange: (d: boolean) => void;
  }) => (
    <div>
      <span>
        pane for {p.doc.path}
        {p.devdigestId ? ` (id ${p.devdigestId})` : ""}
      </span>
      <button onClick={() => p.onDirtyChange(true)}>make dirty</button>
      <button onClick={() => p.onCopied(copied(false))}>copy existing</button>
    </div>
  ),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  list = READY;
  dd = DD;
  ddState = { isError: false, isFetching: false };
  search = new URLSearchParams();
  crumbs = [];
  lastToolbar = undefined;
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ context: contextMessages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("renders the two-panel layout bounded to the viewport, with crumb, title, footer and select hint", () => {
    renderView();
    expect(crumbs).toEqual([{ label: "acme/payments-api", mono: true }, { label: "Project Context" }]);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("PROJECT CONTEXT")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter documents…" })).toBeInTheDocument();
    expect(screen.getByText(/3 docs · synced/)).toBeInTheDocument();
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();

    const left = screen.getByRole("complementary");
    const root = left.parentElement as HTMLElement;
    expect(root).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "320px minmax(0, 1fr)",
      height: "calc(100vh - 52px)",
      overflow: "hidden",
    });
    expect(root.style.maxWidth).toBe("");
    expect(root.style.margin).toBe("");
    expect(left).toHaveStyle({ minHeight: "0", height: "100%" });
    expect(screen.getByTestId("tree").parentElement).toHaveStyle({ overflow: "auto", minHeight: "0" });
    const docRegion = screen.getByText("Select a document to preview it.").parentElement as HTMLElement;
    expect(docRegion).toHaveStyle({ overflow: "auto", minHeight: "0" });
    expect(docRegion.parentElement).toHaveStyle({ minHeight: "0", height: "100%" });
  });

  it("shows 'not synced' in the footer when the repo was never indexed", () => {
    dd = { ...DD, synced_at: null };
    renderView();
    expect(screen.getByText("3 docs · not synced")).toBeInTheDocument();
  });

  it("shows the DocPane for ?path=", () => {
    search = new URLSearchParams("path=docs/a.md");
    renderView();
    expect(screen.getByText("pane for docs/a.md")).toBeInTheDocument();
    expect(screen.queryByText("Select a document to preview it.")).not.toBeInTheDocument();
  });

  it("a selected .devdigest doc waits for its id instead of opening as a read-only repo doc", () => {
    const DD_ROW = { path: ".devdigest/specs/x.md", source: "devdigest" as const, tokens: 10, attached_agents: 0 };
    list = { ...READY, docs: [...DOCS, DD_ROW] };
    search = new URLSearchParams("path=.devdigest/specs/x.md");

    dd = undefined; // list still loading
    const { unmount } = renderView();
    expect(screen.queryByText(/pane for/)).not.toBeInTheDocument();
    expect(screen.queryByText("Select a document to preview it.")).not.toBeInTheDocument();
    unmount();

    ddState = { isError: true, isFetching: false }; // list failed
    const failed = renderView();
    expect(screen.queryByText(/pane for/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(ddRefetch).toHaveBeenCalledTimes(1);
    failed.unmount();

    ddState = { isError: false, isFetching: false };
    dd = { ...DD, docs: [{ id: "d9", path: DD_ROW.path, tokens: 10, copied_from: null, updated_at: "x" }] };
    renderView();
    expect(screen.getByText("pane for .devdigest/specs/x.md (id d9)")).toBeInTheDocument();
  });

  it("notes ignored repo .devdigest files; not cloned shows the notice and keeps the tree", () => {
    dd = { ...DD, ignored_repo_paths: 2 };
    list = {
      repo_id: "r1",
      state: { status: "not_cloned" },
      docs: [{ path: ".devdigest/specs/x.md", source: "devdigest", tokens: 10, attached_agents: 0 }],
    };
    renderView();
    expect(screen.getByText(/2 files in the repo's \.devdigest\/ folder are ignored/)).toBeInTheDocument();
    expect(screen.getByText("Repo not cloned yet")).toBeInTheDocument();
    expect(screen.getByTestId("tree")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ".devdigest/specs/x.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resync" })).toBeInTheDocument();
  });

  it("an empty cloned repo shows the searched locations and a working Resync", () => {
    list = { ...READY, docs: [] };
    renderView();
    expect(screen.getByText("No documents found in this repo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(resyncStart).toHaveBeenCalledTimes(1);
  });

  it("a failed index shows a status banner with the reason above the tree", () => {
    list = { ...READY, state: { status: "index_failed", reason: "boom" } };
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent("Reason: boom");
    expect(screen.getByTestId("tree")).toBeInTheDocument();
  });

  it("creating a file selects it in edit mode; a folder click sets the toolbar target", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "toolbar create" }));
    expect(replace).toHaveBeenCalledWith("/repos/r1/context?path=.devdigest%2Fspecs%2Fa.md&mode=edit", {
      scroll: false, // query-only change: keep the two-panel layout where it is
    });
    fireEvent.click(screen.getByRole("button", { name: "folder drafts" }));
    expect(lastToolbar?.targetFolder).toBe("drafts");
  });

  it("guards selection while the pane is dirty, and an existing copy opens with the notice", () => {
    search = new URLSearchParams("path=docs/a.md");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "copy existing" }));
    expect(replace).toHaveBeenCalledWith(
      "/repos/r1/context?path=.devdigest%2Fspecs%2Fa.md&mode=edit&copy=exists",
      { scroll: false },
    );
  });
});
