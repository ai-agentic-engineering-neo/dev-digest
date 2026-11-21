import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/projectGraph.json";
import { api, ApiError } from "@/lib/api";
import { ProjectGraphView } from "./ProjectGraphView";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "repo-1" }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo not found</div> }));
// React Flow/ELK are third-party and covered by graph-canvas's own tests; this stub
// exposes what the view passes in (nodes as buttons, banners, announcement).
vi.mock("@/components/graph-canvas", async () => {
  const actual = await vi.importActual<typeof import("@/components/graph-canvas")>("@/components/graph-canvas");
  return {
    ...actual,
    GraphCanvasLazy: (p: import("@/components/graph-canvas").GraphCanvasProps) => (
      <div role="region" aria-label={p.ariaLabel}>
        {p.banners?.map((b) => (
          <p key={b.id}>{b.text}</p>
        ))}
        <p data-testid="announcement">{p.announcement}</p>
        {p.nodes.map((n) => (
          <button key={n.id} type="button" onClick={() => p.onSelect?.(n.id)} aria-pressed={!!n.highlighted}>
            {`${n.label} [${(n.tags ?? []).join(",")}] ${n.role}${n.dimmed ? " dimmed" : ""}`}
          </button>
        ))}
      </div>
    ),
  };
});

const get = vi.spyOn(api, "get");

const INDEX = {
  status: "full",
  indexedSha: "abc123def",
  indexerVersion: 3,
  coverage: {
    value: { resolved: 90, total: 100 },
    type: { resolved: 40, total: 50 },
    unresolvedBySpecifier: 12,
    tsconfigFailures: [],
    inferredShare: 0.25,
  },
};
const node = (o: object) => ({ fileCount: 1, aggregate: false, rank: 0.1, hot: false, inCycle: false, ...o });

const OVERVIEW = {
  state: "ready",
  index: INDEX,
  focus: { mode: "overview", depth: 1, dir: null, file: null },
  nodes: [
    node({ id: "src", kind: "directory", label: "src", path: "src", fileCount: 12 }),
    node({ id: "lib", kind: "directory", label: "lib", path: "lib", fileCount: 3, hot: true }),
    node({ id: "a.ts", kind: "file", label: "a.ts", path: "a.ts", inCycle: true }),
  ],
  edges: [{ from: "src", to: "lib", weight: 7 }],
  truncation: { truncated: true, nodesDropped: 5, edgesDropped: 9, maxNodes: 400, maxEdges: 1200 },
  cycles: { items: [{ size: 2, members: ["a.ts", "b.ts"], membersTruncated: false }], total: 1, filesInCycles: 2 },
  hotFiles: [{ path: "lib/core.ts", rank: 0.5, hotness: 0.9 }],
};
const DIR = { ...OVERVIEW, focus: { mode: "dir", depth: null, dir: "src", file: null }, truncation: { ...OVERVIEW.truncation, truncated: false },
  nodes: [node({ id: "src/x.ts", kind: "file", label: "x.ts", path: "src/x.ts" })], edges: [] };
const FILE = { ...DIR, focus: { mode: "file", depth: null, dir: null, file: "src/x.ts" },
  nodes: [node({ id: "src/x.ts#run", kind: "symbol", label: "run", path: "src/x.ts", exported: true })] };

const row = (path: string, o = {}) => ({ path, inCount: 1, outCount: 2, rank: 0.25, hotness: 0.5, hot: false, inCycle: false, ...o });

let graphResponse: unknown;
let filesCalls: string[];
beforeEach(() => {
  filesCalls = [];
  graphResponse = undefined;
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/repos/repo-1/graph/files")) {
      filesCalls.push(path);
      const page = Number(/page=(\d+)/.exec(path)?.[1] ?? 1);
      return { state: "ready", index: INDEX, dir: null, items: [row(`p${page}/f.ts`, { inCycle: page === 1 })], page, pageSize: 1, total: 2 };
    }
    if (path.startsWith("/repos/repo-1/graph/unresolved"))
      return { state: "ready", index: INDEX, items: [{ file: "a.ts", specifier: "./gone", importedName: "x", line: 3, reason: "missing" }], page: 1, pageSize: 50, total: 1 };
    if (path.startsWith("/repos/repo-1/graph/symbols"))
      return { state: "ready", index: INDEX, file: "src/x.ts", items: [{ name: "run", kind: "function", line: 4, endLine: 9, exported: true, inCount: 2, outCount: 1 }], page: 1, pageSize: 200, total: 1 };
    if (path.startsWith("/repos/repo-1/graph")) {
      if (path.includes("file=")) return FILE;
      if (path.includes("dir=")) return DIR;
      if (graphResponse instanceof Error) throw graphResponse;
      return graphResponse;
    }
    throw new Error(`unexpected ${path}`);
  });
});
afterEach(() => {
  cleanup();
  get.mockReset();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ projectGraph: messages }}>
        <ProjectGraphView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectGraphView", () => {
  it("renders the overview, expands a directory, opens a file and goes back", async () => {
    graphResponse = OVERVIEW;
    renderView();
    // hot/cycle are distinguished by role + tag, not colour; a hot DIRECTORY keeps the
    // directory role (hot is a tag) and shows its file count
    expect(await screen.findByRole("button", { name: /^lib \[hot,3 files\] directory/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^a\.ts \[cycle\] cycle/ })).toBeInTheDocument();
    expect(screen.getByText(/The graph is truncated: 5 nodes and 9 edges/)).toBeInTheDocument();
    expect(screen.getByTestId("announcement")).toHaveTextContent("Graph overview loaded: 3 nodes, 1 edges.");
    // index status, sha, coverage, unresolved list
    expect(screen.getByText("abc123def")).toBeInTheDocument();
    expect(screen.getByText("90 of 100")).toBeInTheDocument();
    expect(await screen.findByText("./gone")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^src \[12 files\]/ }));
    expect(await screen.findByRole("button", { name: /^x\.ts/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/repos/repo-1/graph?dir=src");
    expect(screen.getByTestId("announcement")).toHaveTextContent("Directory src expanded");

    fireEvent.click(screen.getByRole("button", { name: /^x\.ts/ }));
    expect(await screen.findByRole("button", { name: /^run \[exported\]/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/repos/repo-1/graph?file=src%2Fx.ts");
    expect(await screen.findByRole("heading", { name: "Symbols in src/x.ts" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: /^x\.ts/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("button", { name: /^lib \[hot/ })).toBeInTheDocument();
  });

  it("lists cycles with members and highlights/dims nodes", async () => {
    graphResponse = OVERVIEW;
    renderView();
    const cycles = (await screen.findByRole("heading", { name: "Dependency cycles" })).closest("section")!;
    expect(within(cycles).getByText("b.ts")).toBeInTheDocument();
    fireEvent.click(within(cycles).getByRole("button", { name: "Highlight cycle 1" }));
    expect(screen.getByRole("button", { name: /^a\.ts .* cycle$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^lib .* dimmed$/ })).toBeInTheDocument();
    fireEvent.click(within(cycles).getByRole("button", { name: "Clear highlight" }));
    expect(screen.queryByRole("button", { name: /dimmed$/ })).not.toBeInTheDocument();
  });

  it("table is sortable and paged, rows open a file", async () => {
    graphResponse = OVERVIEW;
    renderView();
    expect(await screen.findByText("p1/f.ts")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Incoming/ })).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Rank" }));
    await waitFor(() => expect(filesCalls.some((c) => c.includes("sort=rank"))).toBe(true));
    expect(screen.getByRole("columnheader", { name: /Rank/ })).toHaveAttribute("aria-sort", "descending");

    const section = screen.getByRole("heading", { name: "Files (table view)" }).closest("section")!;
    fireEvent.click(within(section).getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("p2/f.ts")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2 (2 total)")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Next page" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Open p2/f.ts" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/repos/repo-1/graph?file=p2%2Ff.ts"));
  });

  it.each([
    ["never_indexed", "Not indexed yet"],
    ["indexing", "Indexing in progress"],
    ["failed", "Indexing failed"],
  ])("shows the %s empty state without a canvas", async (reason, title) => {
    graphResponse = { state: "empty", reason };
    renderView();
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No graph available.");
  });

  it("shows reindexing progress and no canvas", async () => {
    graphResponse = { state: "reindexing", reindexing: { state: "running", done: 30, total: 120 } };
    renderView();
    expect(await screen.findByText("Re-indexing in progress")).toBeInTheDocument();
    expect(screen.getByText("30 of 120 files")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Re-indexing progress" })).toHaveAttribute("value", "30");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows an error and retries", async () => {
    graphResponse = new ApiError("boom", 500);
    renderView();
    expect(await screen.findByText("Could not load the project graph")).toBeInTheDocument();
    graphResponse = OVERVIEW;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("button", { name: /^lib \[hot/ })).toBeInTheDocument();
  });
});
