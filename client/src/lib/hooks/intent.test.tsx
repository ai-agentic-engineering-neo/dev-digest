import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import { createQueryClient } from "../query-client";
import type { PrIntent } from "../types";
import { useRefreshIntent, useResetIntent, usePrIntent, useSaveIntentOverride } from "./intent";

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
});

describe("intent mutations", () => {
  it("refresh posts, then writes the returned entity into the cache before invalidating", async () => {
    vi.mocked(api.post).mockResolvedValue(INTENT);
    const { qc, wrapper } = setup();
    const order: string[] = [];
    const setSpy = vi.spyOn(qc, "setQueryData").mockImplementation((...a) => {
      order.push("set");
      return Object.getPrototypeOf(qc).setQueryData.apply(qc, a);
    });
    vi.spyOn(qc, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
    });
    const { result } = renderHook(() => useRefreshIntent("pr1"), { wrapper });

    await result.current.mutateAsync();

    expect(api.post).toHaveBeenCalledWith("/pulls/pr1/intent/refresh");
    expect(setSpy).toHaveBeenCalled();
    expect(order).toEqual(["set", "invalidate"]);
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
