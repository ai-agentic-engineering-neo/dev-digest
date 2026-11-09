import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { ApiError, api } from "../api";
import {
  useRunReviewsParallel,
  usePrActiveRuns,
  usePrReviews,
  usePrRuns,
  useRefreshReviewsWhenRunsSettle,
} from "./reviews";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { post: vi.fn(), get: vi.fn() },
}));

const post = vi.mocked(api.post);
const get = vi.mocked(api.get);

function setup() {
  const qc = createQueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useRunReviewsParallel("pr1"), { wrapper });
  return { hook, invalidate };
}

const ok = (agentId: string) => ({
  pr_id: "pr1",
  runs: [{ agent_id: agentId, run_id: `run-${agentId}` }],
  reviews: [],
});

describe("useRunReviewsParallel", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("fires all requests before any settles, reports per-agent failures, invalidates caches", async () => {
    const resolvers: Array<() => void> = [];
    post.mockImplementation((_path: string, body?: unknown) => {
      const { agentId } = body as { agentId: string };
      return new Promise((resolve, reject) => {
        resolvers.push(() =>
          agentId === "b"
            ? reject(new ApiError("Rate limit exceeded", 429))
            : resolve(ok(agentId)),
        );
      });
    });
    const { hook, invalidate } = setup();

    let pending!: Promise<unknown>;
    act(() => {
      pending = hook.result.current.mutateAsync(["a", "b", "c"]);
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(post).toHaveBeenCalledWith("/pulls/pr1/review", { agentId: "a" });
    expect(post).toHaveBeenCalledWith("/pulls/pr1/review", { agentId: "b" });
    expect(post).toHaveBeenCalledWith("/pulls/pr1/review", { agentId: "c" });

    await act(async () => {
      resolvers.forEach((r) => r());
      await pending;
    });

    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    expect(hook.result.current.data).toEqual([
      { agent_id: "a", ok: true, run_id: "run-a" },
      { agent_id: "b", ok: false, error: "Rate limit exceeded" },
      { agent_id: "c", ok: true, run_id: "run-c" },
    ]);
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["pr-runs", "pr1"]);
    expect(keys).toContainEqual(["pr-active-runs", "pr1"]);
    expect(keys).toContainEqual(["reviews", "pr1"]);
  });

  it("a response without a run for the agent is a failure with error null (UI supplies the text)", async () => {
    post.mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [] });
    const { hook } = setup();

    let results!: unknown;
    await act(async () => {
      results = await hook.result.current.mutateAsync(["a"]);
    });
    expect(results).toEqual([{ agent_id: "a", ok: false, error: null }]);
  });
});

describe("useRefreshReviewsWhenRunsSettle", () => {
  let activeRuns: unknown[];

  function useHarness(id: string) {
    const active = usePrActiveRuns(id);
    useRefreshReviewsWhenRunsSettle(id, (active.data?.length ?? 0) > 0);
    usePrReviews(id);
    usePrRuns(id);
  }

  const calls = (path: string) => get.mock.calls.filter((c) => c[0] === path).length;

  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    get.mockImplementation(async (path: string) => (path.endsWith("/runs/active") ? activeRuns : []));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mount() {
    const qc = createQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useHarness("pr1"), { wrapper });
  }

  it("re-requests reviews and runs when the active run settles, without any model call", async () => {
    activeRuns = [{ run_id: "r1", agent_id: "a", agent_name: "A", ran_at: null }];
    mount();
    await waitFor(() => expect(calls("/pulls/pr1/reviews")).toBe(1));
    expect(calls("/pulls/pr1/runs")).toBe(1);

    activeRuns = [];
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    await waitFor(() => expect(calls("/pulls/pr1/reviews")).toBe(2));
    expect(calls("/pulls/pr1/runs")).toBe(2);
    expect(post).not.toHaveBeenCalled();
  });

  it("does not refetch when nothing was ever running", async () => {
    activeRuns = [];
    mount();
    await waitFor(() => expect(calls("/pulls/pr1/reviews")).toBe(1));

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(calls("/pulls/pr1/reviews")).toBe(1);
    expect(calls("/pulls/pr1/runs")).toBe(1);
  });
});
