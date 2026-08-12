import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DocumentContent, DocumentList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

// AppShell pulls in the sidebar/command-palette/shell-context machinery, none
// of which this view's own behaviour depends on — replaced with a passthrough
// so the test exercises ProjectContextView itself, not AppShell's internals.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LIST: DocumentList = {
  roots: ["specs", "docs"],
  documents: [
    { path: "specs/09-project-context-folder.md", doc_type: "specs", tokens: 300, used_by: 2 },
    { path: "docs/architecture.md", doc_type: "docs", tokens: 220, used_by: 0 },
  ],
  summary: { count: 2, tokens: 520, bounded: 0 },
};

const CONTENT: DocumentContent = {
  path: "specs/09-project-context-folder.md",
  content: "# Project Context\n\nBody text.",
};

const EMPTY_LIST: DocumentList = {
  roots: ["specs", "docs", ".devdigest/specs"],
  documents: [],
  summary: { count: 0, tokens: 0, bounded: 0 },
};

const refetch = vi.fn();
const setRootsMutate = vi.fn();
let listData: DocumentList = LIST;

vi.mock("@/lib/hooks/project-context", () => ({
  useRepoDocuments: () => ({
    data: listData,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch,
  }),
  useDocument: (_repoId: string | null, path: string | null) => ({
    data: path ? CONTENT : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSetDocRoots: () => ({ mutate: setRootsMutate, isPending: false }),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listData = LIST;
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("lists every discovered document with its token count and used-by count, and selecting one shows its read-only preview", () => {
    renderView();
    expect(screen.getByText("specs/09-project-context-folder.md")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("300 tokens")).toBeInTheDocument();
    expect(screen.getByText("used by 2 agents")).toBeInTheDocument();
    expect(screen.getByText("not attached")).toBeInTheDocument();
    expect(screen.getByText("2 documents · 520 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByText("specs/09-project-context-folder.md"));
    expect(screen.getByText("Body text.")).toBeInTheDocument();
  });

  it("offers no control that could modify a document, and shows no chunk/coverage metric (AC-35, AC-39)", () => {
    renderView();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/chunk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();
  });

  it("AC-20 — zero discovered documents renders an empty state naming the searched roots, not an error", () => {
    listData = EMPTY_LIST;
    renderView();
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    // The empty state names every configured root (so a refresh or a roots
    // change is legible in the same view, US-8/AC-29) — never a bare "no
    // documents" dead end that hides where it looked.
    expect(
      screen.getByText(`No markdown files were found under the searched roots: ${EMPTY_LIST.roots.join(", ")}. Add PRDs, tech specs, or architecture notes under one of those folders, or change the search roots above.`),
    ).toBeInTheDocument();
    // Not an error state — no retry control.
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
