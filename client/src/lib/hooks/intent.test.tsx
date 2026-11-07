import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import { createQueryClient } from "../query-client";
import type { PrIntent } from "../types";
import {
  INTENT_LIVE_POLL_MS,
  useRefreshIntent,
  useRefreshIntentWhenRunsSettle,
  useResetIntent,
  usePrIntent,
  useSaveIntentOverride,
} from "./intent";

vi.mock("../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const INTENT = { pr_id: "pr1", status: "ok", intent: "Add intent card" } as PrIntent;
const KEY = ["pr-intent", "pr1"];

function setup() {
  const qc = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePrIntent", () => {
  it("reads GET /pulls/:id/intent and keeps a null answer", async () => {
    vi.mocked(api.get).mockResolvedValue(null);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIntent("pr1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/pulls/pr1/intent");
    expect(result.current.data).toBeNull();
  });

  it("polls while a review is running and stops when it is not", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.get).mockResolvedValue(null);
      const { wrapper } = setup();
      const { rerender } = renderHook(({ live }) => usePrIntent("pr1", { live }), {
        wrapper,
        initialProps: { live: true },
      });
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(INTENT_LIVE_POLL_MS + 10));
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

      rerender({ live: false });
      const calls = vi.mocked(api.get).mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(INTENT_LIVE_POLL_MS * 3));
      expect(vi.mocked(api.get).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRefreshIntentWhenRunsSettle", () => {
  it("invalidates the intent once when reviews go from running to settled", () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const { rerender } = renderHook(({ running }) => useRefreshIntentWhenRunsSettle("pr1", running), {
      wrapper,
      initialProps: { running: false },
    });
    expect(spy).not.toHaveBeenCalled();

    rerender({ running: true });
    expect(spy).not.toHaveBeenCalled();

    rerender({ running: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: KEY });

    rerender({ running: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("intent mutations", () => {
  it("refresh re-syncs the PR from GitHub first, then derives and writes the entity before invalidating", async () => {
    const DETAIL = { id: "pr1", body: "Edited on GitHub" };
    const calls: string[] = [];
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      calls.push(`GET ${url}`);
      return DETAIL;
    });
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      calls.push(`POST ${url}`);
      return INTENT;
    });
    const { qc, wrapper } = setup();
    const order: string[] = [];
    vi.spyOn(qc, "setQueryData").mockImplementation((...a) => {
      order.push(`set ${String(a[0][0])}`);
      return Object.getPrototypeOf(qc).setQueryData.apply(qc, a);
    });
    vi.spyOn(qc, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
    });
    const { result } = renderHook(() => useRefreshIntent("pr1"), { wrapper });

    await result.current.mutateAsync();

    expect(calls).toEqual(["GET /pulls/pr1", "POST /pulls/pr1/intent/refresh"]);
    expect(order).toEqual(["set pull", "set pr-intent", "invalidate"]);
    expect(qc.getQueryData(["pull", "pr1"])).toEqual(DETAIL);
    expect(qc.getQueryData(KEY)).toEqual(INTENT);
  });

  it("refresh still derives when the PR re-sync fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("offline"));
    vi.mocked(api.post).mockResolvedValue(INTENT);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useRefreshIntent("pr1"), { wrapper });

    await result.current.mutateAsync();

    expect(api.post).toHaveBeenCalledWith("/pulls/pr1/intent/refresh");
    expect(qc.getQueryData(["pull", "pr1"])).toBeUndefined();
    expect(qc.getQueryData(KEY)).toEqual(INTENT);
  });

  it("save override PUTs the exact body", async () => {
    vi.mocked(api.put).mockResolvedValue(INTENT);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSaveIntentOverride("pr1"), { wrapper });
    const body = { intent: "Do X", in_scope: ["a"], out_of_scope: ["b"] };

    await result.current.mutateAsync(body);

    expect(api.put).toHaveBeenCalledWith("/pulls/pr1/intent", body);
    expect(qc.getQueryData(KEY)).toEqual(INTENT);
  });

  it("reset deletes and caches null when the server returns null", async () => {
    vi.mocked(api.del).mockResolvedValue(null);
    const { qc, wrapper } = setup();
    qc.setQueryData(KEY, INTENT);
    const { result } = renderHook(() => useResetIntent("pr1"), { wrapper });

    await result.current.mutateAsync();

    expect(api.del).toHaveBeenCalledWith("/pulls/pr1/intent");
    expect(qc.getQueryData(KEY)).toBeNull();
  });
});
