/* usePrRuns / usePrActiveRuns poll every 4s while something is running and
   stop once nothing is. Fake timers drive the interval — no real waiting. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { usePrActiveRuns, usePrRuns } from "./reviews";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Advance fake time and flush the promise/notify queue inside act. */
const advance = async (ms: number) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  // A fetch started by that tick resolves over several microtask hops
  // (Response.json, notifyManager) — flush them without moving the clock.
  await act(() => vi.advanceTimersByTimeAsync(0));
};

beforeEach(() => {
  vi.useFakeTimers();
  // notifyManager captured the REAL setTimeout at import time, so observer
  // notifications would escape the fake clock; deliver them as microtasks.
  notifyManager.setScheduler(queueMicrotask);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  qc.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
});

const run = (id: string, status: string) => ({ id, status });

describe("usePrRuns polling", () => {
  it("polls every 4000ms while a run is 'running', then stops", async () => {
    fetchMock
      .mockResolvedValueOnce(json([run("r1", "done"), run("r2", "running")]))
      .mockResolvedValueOnce(json([run("r1", "done"), run("r2", "running")]))
      .mockImplementation(async () => json([run("r1", "done"), run("r2", "failed")]));

    const { result } = renderHook(() => usePrRuns("p1"), { wrapper });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/pulls\/p1\/runs$/);
    expect(result.current.data?.[1]?.status).toBe("running");

    await advance(3999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(4000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data?.[1]?.status).toBe("failed");

    // Nothing running anymore → refetchInterval resolves to false.
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not poll when no run is running", async () => {
    fetchMock.mockImplementation(async () => json([run("r1", "done"), run("r2", "cancelled")]));
    renderHook(() => usePrRuns("p1"), { wrapper });
    await advance(0);
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is disabled without a prId", async () => {
    renderHook(() => usePrRuns(null), { wrapper });
    await advance(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("usePrActiveRuns polling", () => {
  it("polls every 4000ms while the active list is non-empty, then stops when it empties", async () => {
    const active = [{ run_id: "r1", agent_id: "a1", agent_name: "Sec", ran_at: null }];
    fetchMock.mockResolvedValueOnce(json(active)).mockImplementation(async () => json([]));

    const { result } = renderHook(() => usePrActiveRuns("p1"), { wrapper });
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/pulls\/p1\/runs\/active$/);
    expect(result.current.data).toHaveLength(1);

    await advance(4000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual([]);

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not poll an empty active list", async () => {
    fetchMock.mockImplementation(async () => json([]));
    renderHook(() => usePrActiveRuns("p1"), { wrapper });
    await advance(0);
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
