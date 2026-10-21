import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

const DATA: BlastRadiusResponse = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23, endpoints: ["GET /api/public/items"], crons: [] },
        { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45, endpoints: ["POST /api/public/webhooks"], crons: [] },
        { name: "app", file: "src/server.ts", line: 88, endpoints: [], crons: [] },
      ],
      endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
      crons_affected: [],
    },
    {
      symbol: "bucketKey",
      callers: [{ name: "resetBuckets", file: "src/jobs/reset.ts", line: 5, endpoints: [], crons: ["reset-rate-buckets (hourly)"] }],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 changed symbols reach 4 callers in 4 files, 2 endpoints and 1 cron job.",
  degraded: false,
  reason: null,
  head_sha: "abc123",
  history: [
    {
      pr_number: 401,
      title: "Introduce public API namespace",
      merged_at: "2026-03-18T10:00:00.000Z",
      author: "deepak.r",
      files_overlap: ["src/api/public/index.ts"],
      notes: "Original /api/public/* split-out.",
    },
  ],
};

const EMPTY_DEGRADED: BlastRadiusResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "No symbols declared in the changed files were found in the index.",
  degraded: true,
  reason: "index_failed",
  head_sha: "abc123",
  history: [],
};

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="p1" repoId="r1" repoFullName="acme/api" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BlastRadiusCard", () => {
  it("shows the stats, the tree with GitHub caller links, the graph, and the prior PRs", async () => {
    fetchMock.mockImplementation(() => json(DATA));
    const user = userEvent.setup();
    renderCard();

    // Stat row: 2 symbols · 4 callers · 2 endpoints · 1 cron.
    expect(await screen.findByText("symbols")).toBeInTheDocument();
    for (const stat of ["2symbols", "4callers", "2endpoints", "1cron"]) {
      expect(screen.getByText((_, el) => el?.textContent === stat)).toBeInTheDocument();
    }
    expect(screen.queryByText("Approximate")).not.toBeInTheDocument();

    // Tree: the first symbol is open with its callers linked at the PR head; the second is collapsed.
    const first = screen.getByRole("button", { name: /rateLimit\(\)/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveTextContent("3 callers");
    expect(screen.getByRole("link", { name: "src/api/public/index.ts:23" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/abc123/src/api/public/index.ts#L23",
    );
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    const second = screen.getByRole("button", { name: /bucketKey\(\)/ });
    expect(second).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("reset-rate-buckets (hourly)")).not.toBeInTheDocument();
    await user.click(second);
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    // Graph view: one SVG with a node per symbol, caller and endpoint / cron.
    await user.click(screen.getByRole("button", { name: "Graph", pressed: false }));
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    // Every node carries an accessible <title>: symbols, callers ("name · file:line"), targets.
    const node = (text: string | RegExp) => within(svg).getAllByText(text, { selector: "title" });
    expect(node("rateLimit()")).toHaveLength(1);
    expect(node("bucketKey()")).toHaveLength(1);
    expect(node(/ · src\//)).toHaveLength(4);
    expect(node("GET /api/public/items")).toHaveLength(1);
    expect(node("POST /api/public/webhooks")).toHaveLength(1);
    expect(node("reset-rate-buckets (hourly)")).toHaveLength(1);
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.getByText("cron jobs affected")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/api/public/index.ts:23" })).not.toBeInTheDocument();

    // Prior PRs: collapsed with the count, expands to the linked PR with author, date and note.
    const history = screen.getByRole("button", { name: /Prior PRs touching these files/ });
    expect(history).toHaveTextContent("1");
    expect(history).toHaveAttribute("aria-expanded", "false");
    await user.click(history);
    const link = screen.getByRole("link", { name: "Introduce public API namespace" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/pull/401");
    const item = link.closest("li")!;
    expect(within(item).getByText("deepak.r")).toBeInTheDocument();
    expect(within(item).getByText("2026-03-18")).toBeInTheDocument();
    expect(within(item).getByText("1 file in common")).toBeInTheDocument();
    expect(within(item).getByText("Original /api/public/* split-out.")).toBeInTheDocument();

    // One GET for the map, one for the index row (the rebuild baseline); nothing else.
    const urls = fetchMock.mock.calls.map(([u]) => String(u)).sort();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/\/pulls\/p1\/blast$/);
    expect(urls[1]).toMatch(/\/repos\/r1\/index-state$/);
  });

  it("degraded with data shows the Approximate badge", async () => {
    fetchMock.mockImplementation(() => json({ ...DATA, degraded: true, reason: "no_data" }));
    renderCard();
    expect(await screen.findByText("Approximate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rateLimit\(\)/ })).toBeInTheDocument();
  });

  it("degraded without a map shows the reason, rebuilds the index on demand and refetches once the index advances", async () => {
    let rebuilt = false;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (init?.method === "POST") {
        rebuilt = true;
        return json({ status: "accepted" }, 202);
      }
      if (path.endsWith("/index-state")) {
        return json({ status: "full", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "s", updatedAt: rebuilt ? "t2" : "t1" });
      }
      return json(rebuilt ? DATA : EMPTY_DEGRADED);
    });
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText("No impact map yet")).toBeInTheDocument();
    expect(screen.getByText(/The last index run failed/)).toBeInTheDocument();
    expect(screen.queryByText("symbols")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rebuild index" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
      expect(String(post![0])).toMatch(/\/repos\/r1\/resync$/);
    });
    // The index row advanced (t1 → t2), so the card refetched the map without a reload.
    expect(await screen.findByText("symbols")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rateLimit\(\)/ })).toBeInTheDocument();
  });

  it("a map with symbols but no callers says so instead of an empty tree", async () => {
    fetchMock.mockImplementation(() =>
      json({ ...EMPTY_DEGRADED, degraded: false, reason: null, changed_symbols: DATA.changed_symbols }),
    );
    renderCard();
    expect(await screen.findByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
  });
});
