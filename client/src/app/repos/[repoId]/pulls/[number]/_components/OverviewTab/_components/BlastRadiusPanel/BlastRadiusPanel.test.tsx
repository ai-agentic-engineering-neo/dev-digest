import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "@/lib/github-urls";
import type { PrBlastRadius } from "@/lib/types";
import { BlastRadiusPanel } from "./BlastRadiusPanel";

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

interface BlastState {
  data: PrBlastRadius | undefined;
  isLoading: boolean;
  isError: boolean;
}
let current: BlastState = { data: READY, isLoading: false, isError: false };
const refetch = vi.fn();
const resyncMutate = vi.fn();
const statusSpy = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ ...current, refetch }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (...args: unknown[]) => {
    statusSpy(...args);
    return { data: { updatedAt: "2026-11-08T00:00:00.000Z" } };
  },
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
}));

function renderPanel() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusPanel prId={READY.pr_id} repoId="repo-1" repoFullName="acme/app" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  current = { data: READY, isLoading: false, isError: false };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlastRadiusPanel", () => {
  it("renders the ready state with links pinned to link_sha", () => {
    renderPanel();
    const summary = screen.getByRole("group", { name: "Blast radius summary" });
    expect(within(summary).getByText("2 symbols")).toBeInTheDocument();
    expect(within(summary).getByText("3 callers")).toBeInTheDocument();
    expect(within(summary).getByText("1 endpoint")).toBeInTheDocument();
    expect(within(summary).getByText("0 cron/jobs")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "server/src/x.ts:12" });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/app", "idx111", "server/src/x.ts", 12));
    expect(link.getAttribute("href")).not.toContain("head999");
    expect(screen.getByText("1 more changed symbol has no callers.")).toBeInTheDocument();
  });

  it("shows the empty message for a computed map without callers", () => {
    current = {
      ...current,
      data: { ...READY, downstream: [], counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } },
    };
    renderPanel();
    expect(screen.getByText("0 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("offers resync for a partial index and starts polling", () => {
    current = { ...current, data: { ...READY, degraded: true, reason: "index_partial" } };
    renderPanel();
    expect(screen.getByText(messages.degraded.index_partial)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "server/src/x.ts:12" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(resyncMutate).toHaveBeenCalled();
    expect(statusSpy).toHaveBeenLastCalledWith("repo-1", true);
  });

  it("explains no_data without resync or an empty-map claim", () => {
    current = {
      ...current,
      data: { ...READY, downstream: [], degraded: true, reason: "no_data", counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 } },
    };
    renderPanel();
    expect(screen.getByText(messages.degraded.no_data)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no downstream callers found/)).not.toBeInTheDocument();
  });

  it("handles loading and error states", () => {
    current = { data: undefined, isLoading: true, isError: false };
    const { unmount } = renderPanel();
    expect(screen.getByLabelText("Loading blast radius…")).toHaveAttribute("aria-busy", "true");
    unmount();

    current = { data: undefined, isLoading: false, isError: true };
    renderPanel();
    expect(screen.getByText("Couldn't load the blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
