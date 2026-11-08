import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import contextMessages from "../../../../../../../messages/en/context.json";
import type { ContextDocContent, ContextDocList } from "@/lib/types";

/* Project Context page: hooks, AppShell, repo context and navigation are mocked. */

const DOCS: ContextDocList["docs"] = [
  { path: "README.md", source: "readme", tokens: 120, attached_agents: 0 },
  { path: "docs/rate-limiting.md", source: "docs", tokens: 820, attached_agents: 2 },
  { path: "server/specs/auth.md", source: "specs", tokens: 300, attached_agents: 1 },
];
const READY: ContextDocList = { repo_id: "r1", state: { status: "ready" }, docs: DOCS };

let list: ContextDocList | undefined = READY;
let doc: ContextDocContent | undefined;
let search = new URLSearchParams();
const replace = vi.fn();
const resyncStart = vi.fn();

vi.mock("@/lib/hooks/project-context", () => ({
  contextDocsKey: (repoId: string) => ["context-docs", repoId],
  useContextDocs: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
  useContextDoc: (_repoId: string, path: string | null) => ({
    data: path ? doc : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextResync: () => ({ start: resyncStart, busy: false }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  list = READY;
  doc = undefined;
  search = new URLSearchParams();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ProjectContextView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const docButtons = () => screen.queryAllByRole("button", { name: /\.md$/ });

describe("ProjectContextView", () => {
  it("lists each doc with path, source, tokens and attached-agents count (AC-1)", () => {
    renderView();
    const row = screen.getByRole("button", { name: "docs/rate-limiting.md" });
    expect(row).toHaveTextContent("docs/rate-limiting.md");
    expect(row).toHaveTextContent("docs");
    expect(row).toHaveTextContent("~820 tokens");
    expect(row).toHaveTextContent("2 agents");
    expect(screen.getByRole("button", { name: "README.md" })).toHaveTextContent("no agents");
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();
  });

  it("clicking a doc puts it in ?path= (AC-2)", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "server/specs/auth.md" }));
    expect(replace).toHaveBeenCalledWith("/repos/r1/context?path=server%2Fspecs%2Fauth.md");
  });

  it("previews the selected doc as rendered markdown with its meta, without executing HTML (AC-2)", () => {
    search = new URLSearchParams("path=docs/rate-limiting.md");
    doc = { ...DOCS[1]!, content: "# Rate limiting\n\nUse a bucket.\n\n<script>window.pwned = 1</script>" };
    const { container } = renderView();
    expect(screen.getByRole("heading", { name: "Rate limiting" })).toBeInTheDocument();
    expect(screen.getByText("Path")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "docs/rate-limiting.md" })).toHaveAttribute("aria-current", "true");
  });

  it("filters by folder or name, and shows 'No documents found' for no match (AC-3)", () => {
    renderView();
    const input = screen.getByRole("textbox", { name: "Filter documents…" });
    fireEvent.change(input, { target: { value: "SPECS" } });
    expect(docButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["server/specs/auth.md"]);
    fireEvent.change(input, { target: { value: "nothing-here" } });
    expect(docButtons()).toHaveLength(0);
    expect(screen.getByText("No documents found")).toBeInTheDocument();
  });

  it("a listed repo with no docs shows the searched locations and a Resync that resyncs (AC-4)", async () => {
    list = { ...READY, docs: [] };
    renderView();
    expect(screen.getByText("No documents found in this repo")).toBeInTheDocument();
    expect(screen.getByText(/Searched: the root README\.md/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(resyncStart).toHaveBeenCalledTimes(1);
  });

  it("not cloned → blocking state with Resync and NO list, filter or preview (AC-5)", () => {
    list = { repo_id: "r1", state: { status: "not_cloned" }, docs: [] };
    renderView();
    expect(screen.getByText("Repo not cloned yet")).toBeInTheDocument();
    expect(screen.getByText("Docs are read from the local clone. Resync to fetch it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resync" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Select a document to preview it.")).not.toBeInTheDocument();
    expect(docButtons()).toHaveLength(0);
  });

  it("failed index → status banner with reason above a working list (AC-5)", () => {
    list = { ...READY, state: { status: "index_failed", reason: "boom" } };
    renderView();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Code index failed");
    expect(banner).toHaveTextContent("Reason: boom");
    expect(screen.getByRole("button", { name: "Resync" })).toBeInTheDocument();
    expect(docButtons()).toHaveLength(3);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "readme" } });
    expect(docButtons()).toHaveLength(1);
  });

  it("degraded index without a reason → 'No reason recorded.' above the list (AC-5)", () => {
    list = { ...READY, state: { status: "index_degraded", reason: null } };
    renderView();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Code index is degraded");
    expect(banner).toHaveTextContent("No reason recorded.");
    expect(docButtons()).toHaveLength(3);
  });
});
