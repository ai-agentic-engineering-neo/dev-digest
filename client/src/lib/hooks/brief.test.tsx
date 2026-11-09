import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { ApiError, api } from "../api";
import { notify } from "../toast";
import { FEATURE_MODELS } from "../feature-models";
import type { PrBriefResponse } from "../types";
import { BRIEF_POLL_MS, prBriefKey, useGenerateBrief, usePrBrief } from "./brief";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const mocked = vi.mocked(api);

const model = { provider: "openrouter", model: "deepseek/deepseek-v4-flash" } as const;
const base: PrBriefResponse = {
  pr_id: "p1",
  model,
  changed_files: 2,
  generating: false,
  outdated: false,
  brief: null,
};

function setup(qc: QueryClient = createQueryClient()) {
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, wrapper };
}

describe("brief hooks", () => {
  beforeEach(() => {
    mocked.get.mockReset();
    mocked.post.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls every 3 s while generating and stops when it turns false", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocked.get
      .mockResolvedValueOnce({ ...base, generating: true })
      .mockResolvedValueOnce({ ...base, generating: false });
    const { wrapper } = setup(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper });

    await waitFor(() => expect(result.current.data?.generating).toBe(true));
    expect(mocked.get).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(BRIEF_POLL_MS + 100));
    await waitFor(() => expect(result.current.data?.generating).toBe(false));
    expect(mocked.get).toHaveBeenCalledTimes(2);
    expect(mocked.get).toHaveBeenCalledWith("/pulls/p1/brief");

    await act(() => vi.advanceTimersByTimeAsync(BRIEF_POLL_MS * 3));
    expect(mocked.get).toHaveBeenCalledTimes(2);
  });

  it("generate POSTs, caches the result before refetching, and does not toast on failure", async () => {
    const toast = vi.spyOn(notify, "error").mockImplementation(() => undefined);
    const { qc, wrapper } = setup();
    qc.setQueryData(prBriefKey("p1"), base);
    const ready = { ...base, changed_files: 3 };
    mocked.post.mockResolvedValueOnce(ready);
    mocked.get.mockResolvedValue(ready);
    const { result } = renderHook(() => useGenerateBrief("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mocked.post).toHaveBeenCalledWith("/pulls/p1/brief");
    expect(qc.getQueryData(prBriefKey("p1"))).toEqual(ready);

    mocked.post.mockRejectedValueOnce(
      new ApiError("big", 422, "brief_too_large", { tokens: 9000, limit: 8000 }),
    );
    let error: unknown;
    await act(async () => {
      await result.current.mutateAsync().catch((e: unknown) => {
        error = e;
      });
    });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("brief_too_large");
    expect((error as ApiError).details).toEqual({ tokens: 9000, limit: 8000 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    toast.mockRestore();
  });

  it("a 404 from generate invalidates the pull", async () => {
    mocked.post.mockRejectedValueOnce(new ApiError("nope", 404, "not_found"));
    mocked.get.mockResolvedValue(base);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useGenerateBrief("p1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pull", "p1"] });
  });

  it("mirrors the server default Risk Brief model", () => {
    const def = FEATURE_MODELS.find((f) => f.id === "risk_brief");
    expect(def?.defaultProvider).toBe("openrouter");
    expect(def?.defaultModel).toBe("deepseek/deepseek-v4-flash");
  });
});
