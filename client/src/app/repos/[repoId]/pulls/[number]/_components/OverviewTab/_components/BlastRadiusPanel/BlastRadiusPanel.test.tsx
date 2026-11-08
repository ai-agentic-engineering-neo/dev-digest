import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "@/lib/github-urls";
import type { PrBlastRadius } from "@/lib/types";
import { BlastRadiusPanel } from "./BlastRadiusPanel";
import { RESYNC_POLL_TIMEOUT_MS } from "./constants";

const READY: PrBlastRadius = {
  pr_id: "11111111-1111-4111-8111-111111111111",
  head_sha: "head999",
  indexed_sha: "idx111",
  link_sha: "idx111",
  changed_symbols: [
    { name: "alpha", file: "server/src/a.ts", kind: "function" },
    { name: "beta", file: "server/src/b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "alpha",
      file: "server/src/a.ts",
      kind: "function",
      callers: [
        { name: "callA", file: "server/src/x.ts", line: 12 },
        { name: "callB", file: "server/src/y.ts", line: 30 },
        { name: "callC", file: "server/src/z.ts", line: 7 },
      ],
      endpoints_affected: ["GET /api/x"],
      crons_affected: [],
    },
  ],
  unattributed_endpoints: [],
  summary: "",
  counts: { symbols: 2, callers: 3, endpoints: 1, crons: 0 },
  callers_omitted: 0,
  degraded: false,
  reason: null,
};
const PARTIAL: PrBlastRadius = { ...READY, degraded: true, reason: "index_partial" };

const T0 = "2026-11-08T10:00:00.000Z";
const T1 = "2026-11-08T10:05:00.000Z";
const T2 = "2026-11-08T10:06:00.000Z";
const POLL_MS = 1500;

/* Fake DevDigest API behind `api.*` — the real query hooks run on top of it.
   Each test sets the server state; mutating it simulates what the server does next. */
interface Server {
  blast: PrBlastRadius | "pending" | "error";
  indexUpdatedAt: string;
  resync: "accepted" | "error";
}
let server: Server;
const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (p: string) => apiGet(p), post: (p: string) => apiPost(p) } };
});

function implementApi() {
  apiGet.mockImplementation(async (path: string) => {
    if (path.endsWith("/blast")) {
      if (server.blast === "pending") return new Promise(() => {});
      if (server.blast === "error") throw new Error("boom");
      return server.blast;
    }
    if (path.endsWith("/prior-pulls")) return { pr_id: READY.pr_id, total: 0, pulls: [] };
    if (path === "/repos/repo-1/index-state") {
      return { status: "partial", filesIndexed: 10, filesSkipped: 2, lastIndexedSha: "idx111", updatedAt: server.indexUpdatedAt };
    }
    throw new Error(`unexpected GET ${path}`);
  });
  apiPost.mockImplementation(async (path: string) => {
    if (path !== "/repos/repo-1/resync") throw new Error(`unexpected POST ${path}`);
    if (server.resync === "error") throw new Error("resync failed");
    return { status: "queued" };
  });
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusPanel prId={READY.pr_id} repoId="repo-1" repoFullName="acme/app" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Lets time pass (polls, timeouts) and flushes the resulting renders. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const resyncButton = () => screen.getByRole("button", { name: /resync index|resyncing/i });

/** Renders a partial map and clicks Resync; returns once the panel shows the running state. */
async function startResync() {
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Resync index" }));
  await advance(0);
  expect(resyncButton()).toBeDisabled();
  expect(resyncButton()).toHaveTextContent("Resyncing…");
}

beforeEach(() => {
  server = { blast: READY, indexUpdatedAt: T0, resync: "accepted" };
  implementApi();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BlastRadiusPanel", () => {
  it("renders the ready state with links pinned to link_sha", async () => {
    renderPanel();
    const summary = await screen.findByRole("group", { name: "Blast radius summary" });
    for (const stat of ["2 symbols", "3 callers", "1 endpoint", "0 crons"]) expect(summary).toHaveTextContent(stat);
    // numbers are bold, labels plain (design 25.png)
    expect(within(summary).getAllByText(/^\d+$/, { selector: "b" }).map((b) => b.textContent)).toEqual(["2", "3", "1", "0"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand alpha, 3 callers" }));
    const link = screen.getByRole("link", { name: "…/src/x.ts:12" });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/app", "idx111", "server/src/x.ts", 12));
    expect(link.getAttribute("href")).not.toContain("head999");
    expect(screen.getByText("1 more changed symbol has no callers.")).toBeInTheDocument();
  });

  it("shows the empty message for a computed map without callers", async () => {
    server.blast = { ...READY, downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } };
    renderPanel();
    expect(await screen.findByText("0 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("explains no_data without resync or an empty-map claim", async () => {
    server.blast = {
      ...READY,
      downstream: [],
      degraded: true,
      reason: "no_data",
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    };
    renderPanel();
    expect(await screen.findByText(messages.degraded.no_data)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no downstream callers found/)).not.toBeInTheDocument();
  });

  it("shows a busy skeleton while loading", () => {
    server.blast = "pending";
    renderPanel();
    expect(screen.getByLabelText("Loading blast radius…")).toHaveAttribute("aria-busy", "true");
  });

  it("shows an error with a working Retry", async () => {
    server.blast = "error";
    renderPanel();
    expect(await screen.findByText("Couldn't load the blast radius")).toBeInTheDocument();
    // the prior-PRs footer is independent of /blast
    expect(await screen.findByText(messages.prior.empty)).toBeInTheDocument();
    server.blast = READY;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("button", { name: "Expand alpha, 3 callers" })).toBeInTheDocument();
  });

  it("switches between the Tree and Graph views", async () => {
    renderPanel();
    const views = await screen.findByRole("group", { name: messages.view.ariaLabel });
    const tree = within(views).getByRole("button", { name: "tree" });
    const graph = within(views).getByRole("button", { name: "graph" });
    expect(tree).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Expand alpha, 3 callers" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: messages.graph.ariaLabel })).not.toBeInTheDocument();

    fireEvent.click(graph);
    expect(graph).toHaveAttribute("aria-pressed", "true");
    expect(tree).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("img", { name: messages.graph.ariaLabel })).toHaveTextContent("callA");
    expect(screen.queryByRole("button", { name: "Expand alpha, 3 callers" })).not.toBeInTheDocument();

    fireEvent.click(tree);
    expect(screen.getByRole("button", { name: "Expand alpha, 3 callers" })).toBeInTheDocument();
  });

  it("requests prior PRs in parallel with /blast and ends the card with the footer", async () => {
    server.blast = "pending"; // /blast never resolves…
    renderPanel();
    // …yet the prior-PRs request has already been sent
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith(`/pulls/${READY.pr_id}/prior-pulls`));
    cleanup();
    server.blast = READY;
    renderPanel();
    expect(await screen.findByText(messages.prior.empty)).toBeInTheDocument();
  });

  it("has no view switch when there is no map to show", async () => {
    server.blast = { ...READY, downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } };
    renderPanel();
    await screen.findByText("0 changed symbol(s), no downstream callers found.");
    expect(screen.queryByRole("group", { name: messages.view.ariaLabel })).not.toBeInTheDocument();
  });

  describe("resync", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      server.blast = PARTIAL;
    });

    it("finishes only after the reindex really advances the index — not on a stale cached state", async () => {
      renderPanel();
      expect(await screen.findByText(messages.degraded.index_partial)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expand alpha, 3 callers" }));
      // Another reindex finished after the page cached T0: the server is already at T1.
      server.indexUpdatedAt = T1;

      fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
      await advance(0);
      expect(apiPost).toHaveBeenCalledWith("/repos/repo-1/resync");

      // First polls still see T1 — our reindex is not done, so the panel keeps waiting.
      await advance(POLL_MS * 2);
      expect(resyncButton()).toHaveTextContent("Resyncing…");
      expect(resyncButton()).toBeDisabled();

      // Our reindex lands (T2) with a better map: the panel refreshes and Resync is available again.
      server.indexUpdatedAt = T2;
      server.blast = {
        ...PARTIAL,
        downstream: [
          { ...PARTIAL.downstream[0]!, callers: [...PARTIAL.downstream[0]!.callers, { name: "callD", file: "server/src/w.ts", line: 5 }] },
        ],
      };
      await advance(POLL_MS);
      expect(await screen.findByRole("link", { name: "…/src/w.ts:5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
      expect(screen.queryByText(messages.resync.timeout)).not.toBeInTheDocument();
    });

    it("gives up after the poll timeout with a still-running hint and re-enables Resync", async () => {
      await startResync();
      await advance(RESYNC_POLL_TIMEOUT_MS);
      expect(screen.getByText(messages.resync.timeout)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
    });

    it("re-enables Resync when the resync request fails", async () => {
      server.resync = "error";
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: "Resync index" }));
      await advance(0);
      expect(apiPost).toHaveBeenCalledWith("/repos/repo-1/resync");
      expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
      expect(screen.queryByText(messages.resync.timeout)).not.toBeInTheDocument();
    });
  });
});
