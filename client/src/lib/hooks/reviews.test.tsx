import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { ApiError, api } from "../api";
import {
  useRunReviewsParallel,
  useFindingAction,
  useDeleteRun,
  useDeleteReview,
  useRunReview,
} from "./reviews";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { post: vi.fn(), del: vi.fn() },
}));

const post = vi.mocked(api.post);
const del = vi.mocked(api.del);

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
    expect(keys).toContainEqual(["smart-diff", "pr1"]);
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

describe("review mutations keep the smart diff fresh", () => {
  beforeEach(() => {
    post.mockReset();
    del.mockReset();
  });

  function setupMutation<T>(useHook: () => T) {
    const qc = createQueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(useHook, { wrapper });
    return { hook, invalidate };
  }

  function expectBothInvalidated(invalidate: { mock: { calls: Array<[{ queryKey?: unknown }?, ...unknown[]]> } }) {
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(["reviews", "pr1"]);
    expect(keys).toContainEqual(["smart-diff", "pr1"]);
  }

  it("useFindingAction invalidates reviews and smart-diff", async () => {
    post.mockResolvedValue({ finding: {} });
    const { hook, invalidate } = setupMutation(() => useFindingAction());
    await act(async () => {
      await hook.result.current.mutateAsync({ findingId: "f1", action: "accept", prId: "pr1" });
    });
    expectBothInvalidated(invalidate);
  });

  it("useDeleteRun invalidates reviews and smart-diff", async () => {
    del.mockResolvedValue({ ok: true });
    const { hook, invalidate } = setupMutation(() => useDeleteRun("pr1"));
    await act(async () => {
      await hook.result.current.mutateAsync("run1");
    });
    expectBothInvalidated(invalidate);
  });

  it("useDeleteReview invalidates reviews and smart-diff", async () => {
    del.mockResolvedValue({ ok: true });
    const { hook, invalidate } = setupMutation(() => useDeleteReview("pr1"));
    await act(async () => {
      await hook.result.current.mutateAsync("rev1");
    });
    expectBothInvalidated(invalidate);
  });

  it("useRunReview invalidates reviews and smart-diff", async () => {
    post.mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [] });
    const { hook, invalidate } = setupMutation(() => useRunReview());
    await act(async () => {
      await hook.result.current.mutateAsync({ prId: "pr1" });
    });
    expectBothInvalidated(invalidate);
  });
});
