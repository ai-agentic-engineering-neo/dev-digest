import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMultiAgentRun } from "./useMultiAgentRun";

type Result = { agent_id: string; ok: true; run_id: string };

const pending: Array<(results: Result[]) => void> = [];
const rejecters: Array<(err: Error) => void> = [];
const mutateAsync = vi.fn(
  () =>
    new Promise<Result[]>((resolve, reject) => {
      pending.push(resolve);
      rejecters.push(reject);
    }),
);

vi.mock("@/lib/hooks/reviews", () => ({
  useRunReviewsParallel: () => ({ mutateAsync }),
}));

beforeEach(() => {
  pending.length = 0;
  rejecters.length = 0;
  mutateAsync.mockClear();
});

describe("useMultiAgentRun", () => {
  it("records pending then started states for the current PR", async () => {
    const { result } = renderHook(() => useMultiAgentRun("pr-a"));

    let done!: Promise<void>;
    act(() => {
      done = result.current.start(["x"]);
    });
    expect(result.current.startStates).toEqual({ x: { status: "pending" } });
    expect(result.current.isStarting).toBe(true);

    await act(async () => {
      pending[0]!([{ agent_id: "x", ok: true, run_id: "run-x" }]);
      await done;
    });
    expect(result.current.startStates).toEqual({ x: { status: "started", run_id: "run-x" } });
    expect(result.current.isStarting).toBe(false);
  });

  it("a rejected start marks every agent failed and re-enables Run instead of staying pending", async () => {
    const { result } = renderHook(() => useMultiAgentRun("pr-a"));

    let done!: Promise<void>;
    act(() => {
      done = result.current.start(["x", "y"]);
    });
    expect(result.current.isStarting).toBe(true);

    await act(async () => {
      rejecters[0]!(new Error("network down"));
      await done; // must resolve — callers use `void start(...)`, a rejection would go unhandled
    });

    expect(result.current.startStates).toEqual({
      x: { status: "failed", error: "network down" },
      y: { status: "failed", error: "network down" },
    });
    expect(result.current.isStarting).toBe(false);
  });

  it("a late result for the previous PR does not wipe the new PR's start states", async () => {
    const { result, rerender } = renderHook(({ prId }) => useMultiAgentRun(prId), {
      initialProps: { prId: "pr-a" },
    });

    let startA!: Promise<void>;
    act(() => {
      startA = result.current.start(["x"]);
    });

    rerender({ prId: "pr-b" });
    act(() => {
      void result.current.start(["y"]);
    });
    expect(result.current.startStates).toEqual({ y: { status: "pending" } });

    // PR A's request resolves after the user switched to PR B and started there.
    await act(async () => {
      pending[0]!([{ agent_id: "x", ok: true, run_id: "run-x" }]);
      await startA;
    });

    expect(result.current.startStates).toEqual({ y: { status: "pending" } });
  });
});
