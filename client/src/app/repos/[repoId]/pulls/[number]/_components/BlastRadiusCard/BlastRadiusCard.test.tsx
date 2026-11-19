import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { api } from "@/lib/api";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";
import impactMessages from "../../../../../../../../messages/en/impactGraph.json";
import graphMessages from "../../../../../../../../messages/en/graph.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
const get = vi.mocked(api.get);

beforeEach(() => get.mockReset());
afterEach(cleanup);

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ impactGraph: impactMessages, graph: graphMessages }}>
        <BlastRadiusCard prId="pr1" repoFullName="acme/app" headSha="abc123" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const trunc = { truncated: false, nodesDropped: 0, edgesDropped: 0, totalsCapped: false, maxDepth: 3, maxNodes: 100, maxEdges: 200 };
const overlay = { staleOverlay: false, overlayDegraded: false, degradedFiles: [], degradedCount: 0, baseSha: "base111", headSha: "abc123", indexedSha: "base111" };

function envelope(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    status: "full",
    data: {
      changed_symbols: [{ name: "core", file: "src/core.ts", kind: "function" }, { name: "gone", file: "src/gone.ts", kind: "function" }],
      downstream: [
        {
          symbol: "core",
          callers: [
            { name: "svc", file: "src/svc.ts", line: 7, rank: 1 },
            { name: "Props", file: "src/types.ts", line: 3, rank: 0, type_only: true },
          ],
          endpoints_affected: ["GET /x"],
          crons_affected: [],
        },
      ],
    },
    index: { status: "full", indexedSha: "base111", lowConfidence: false },
    overlay,
    graph: {
      nodes: [
        { id: "src/core.ts#core", kind: "symbol", name: "core", path: "src/core.ts", role: "changed", depth: 0, symbolKind: "function" },
        { id: "src/gone.ts#gone", kind: "symbol", name: "gone", path: "src/gone.ts", role: "changed", depth: 0, deleted: true },
        { id: "src/svc.ts#svc", kind: "symbol", name: "svc", path: "src/svc.ts", role: "impacted", depth: 1, symbolKind: "function" },
        { id: "src/api.ts", kind: "file", name: "api.ts", path: "src/api.ts", role: "entry_point", depth: 2, entryLabel: "GET /x" },
      ],
      edges: [
        { from: "src/svc.ts#svc", to: "src/core.ts#core", kind: "call", confidence: "exact", typeOnly: false, line: 7 },
        { from: "src/api.ts", to: "src/svc.ts#svc", kind: "call", confidence: "inferred", typeOnly: false },
      ],
      truncation: trunc,
      entryPoints: { items: [{ path: "src/api.ts", type: "endpoint", label: "GET /x", depth: 2 }], total: 1 },
      tests: { items: [{ path: "src/core.test.ts", depth: 1 }], total: 3 },
    },
    ...over,
  };
}

describe("BlastRadiusCard", () => {
  it("defaults to List with entry points, tests, runtime/type-only badges and deleted symbols; toggles to Graph and back", async () => {
    get.mockResolvedValue(envelope());
    renderCard();

    expect(await screen.findByText("src/svc.ts:7")).toBeInTheDocument();
    const listBtn = screen.getByRole("button", { name: "List" });
    expect(listBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("runtime")).toBeInTheDocument();
    expect(screen.getByText("type-only")).toBeInTheDocument();
    expect(screen.getByText("Entry points")).toBeInTheDocument();
    expect(screen.getAllByText("GET /x").length).toBeGreaterThan(0);
    expect(screen.getByText("src/core.test.ts")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByText("core")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
    expect(listBtn).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("region", { name: "PR impact graph" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Showing graph view").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("src/svc.ts:7")).toBeInTheDocument();
  });

  it("graph: selecting a node shows detail with a head-SHA GitHub link; filters hide inferred and re-query without type-only", async () => {
    get.mockResolvedValue(envelope());
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Graph" }));

    fireEvent.click(await screen.findByRole("button", { name: /impacted: svc/ }));
    const detail = await screen.findByRole("region", { name: "Node details" });
    expect(within(detail).getByText("svc")).toBeInTheDocument();
    expect(within(detail).getByText("function")).toBeInTheDocument();
    expect(within(detail).getByText("impacted")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "src/svc.ts:7" })).toHaveAttribute(
      "href",
      "https://github.com/acme/app/blob/abc123/src/svc.ts#L7",
    );

    // hide inferred: entry node only connected via the inferred edge disappears
    expect(screen.getByRole("button", { name: /entry point: api.ts/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide inferred edges" }));
    expect(screen.queryByRole("button", { name: /entry point: api.ts/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show type-only edges" }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/pulls/pr1/blast?include_type_only=false"));
  });

  it("shows every non-blocking banner with counts", async () => {
    const base = envelope();
    get.mockResolvedValue(
      envelope({
        status: "partial",
        overlay: { ...overlay, staleOverlay: true, overlayDegraded: true, degradedCount: 4, degradedFiles: ["a.ts"], indexedSha: "1234567890" },
        index: { status: "partial", indexedSha: "1234567890", lowConfidence: true, coverage: { value: { resolved: 8, total: 10 }, type: { resolved: 5, total: 10 }, unresolvedBySpecifier: 2, tsconfigFailures: [], inferredShare: 0.1 } },
        graph: { ...base.graph!, truncation: { ...trunc, truncated: true, nodesDropped: 12, edgesDropped: 30 } },
      }),
    );
    renderCard();

    const notices = await screen.findByRole("region", { name: "Graph notices" });
    expect(notices).toHaveTextContent("truncated");
    expect(notices).toHaveTextContent("nodes hidden: 12");
    expect(notices).toHaveTextContent("only partially built");
    expect(notices).toHaveTextContent("built at 1234567 but the PR branches off base111");
    expect(notices).toHaveTextContent("4 changed files could not be analysed");
    expect(notices).toHaveTextContent("Low-confidence index");
    expect(notices).toHaveTextContent("value imports resolved (10): 8");
    expect(screen.getByText("src/svc.ts:7")).toBeInTheDocument(); // results still shown
  });

  it("empty state distinguishes full from low-confidence coverage", async () => {
    const empty = { changed_symbols: [], downstream: [] };
    const emptyGraph = { ...envelope().graph!, nodes: [], edges: [], entryPoints: { items: [], total: 0 }, tests: { items: [], total: 0 } };
    get.mockResolvedValueOnce(envelope({ data: empty, graph: emptyGraph }));
    renderCard();
    expect(await screen.findByText(/None of the changed files declare/)).toBeInTheDocument();
    cleanup();

    get.mockResolvedValueOnce(envelope({ data: empty, graph: emptyGraph, index: { status: "full", indexedSha: "x", lowConfidence: true } }));
    renderCard();
    expect(await screen.findByText(/index has low confidence/)).toBeInTheDocument();
  });

  it("reindexing shows progress and no graph/list", async () => {
    get.mockResolvedValue(envelope({ reindexing: { state: "running", done: 3, total: 10 } }));
    renderCard();
    expect(await screen.findByText("Indexing: 3 of 10 files")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Graph" })).not.toBeInTheDocument();
    expect(screen.queryByText("src/svc.ts:7")).not.toBeInTheDocument();
  });

  it("shows loading, then an error with retry that recovers", async () => {
    get.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(envelope());
    renderCard();
    expect(screen.getByRole("status", { name: "Loading blast radius…" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the blast radius.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("src/svc.ts:7")).toBeInTheDocument();
  });
});
