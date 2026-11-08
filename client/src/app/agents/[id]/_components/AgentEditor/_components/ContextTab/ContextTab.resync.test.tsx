import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, renderHook, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { ContextDocList } from "@/lib/types";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

/* Context tab · Resync over a fake DevDigest API — the REAL query hooks run, so this proves the doc
   list is refetched after a resync (a bare repo-intel resync only refreshes the index state, and
   the degraded / not-cloned notice stayed up). */

const DOCS: ContextDocList["docs"] = [{ path: "docs/a.md", source: "docs", tokens: 10, attached_agents: 0 }];
let state: ContextDocList["state"];
let indexedAt: string;
const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (p: string) => apiGet(p), post: (p: string) => apiPost(p) } };
});
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { id: "r1", name: "payments-api", full_name: "acme/payments-api" } }),
}));

import { ContextTab } from "./ContextTab";
import { useContextResync } from "@/lib/hooks/project-context";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  state = { status: "index_degraded", reason: "no_data" };
  indexedAt = "t1";
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/repos/r1/context-docs") return { repo_id: "r1", state, docs: DOCS };
    if (path === "/agents/ag1/context-docs?repo_id=r1") return { agent_id: "ag1", repo_id: "r1", docs: [] };
    if (path === "/repos/r1/index-state") return { status: "full", updatedAt: indexedAt };
    throw new Error(`unexpected GET ${path}`);
  });
  apiPost.mockImplementation(async (path: string) => {
    if (path !== "/repos/r1/resync") throw new Error(`unexpected POST ${path}`);
    state = { status: "ready" }; // the server reindexes; the next doc-list read is healthy
    indexedAt = "t2"; // …and writes a new index row
    return { status: "queued" };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  apiGet.mockReset();
  apiPost.mockReset();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("ContextTab · Resync", () => {
  it("refetches the doc list after a resync, so the degraded banner goes away", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
          <ToastProvider>
            <ContextTab agent={AGENT} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Code index is degraded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    await advance(0);
    expect(apiPost).toHaveBeenCalledWith("/repos/r1/resync");

    await advance(3500); // one doc-list poll
    expect(screen.queryByText("Code index is degraded")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("a ready repo whose status and doc count don't change still finishes once the index timestamp moves", async () => {
    state = { status: "ready" };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useContextResync("r1"), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await advance(0);
    await act(async () => {
      await result.current.start();
    });
    expect(apiPost).toHaveBeenCalledWith("/repos/r1/resync");
    expect(result.current.busy).toBe(true);

    await advance(3500); // one poll sees updatedAt t1 → t2
    expect(result.current.busy).toBe(false);
  });
});
