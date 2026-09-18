import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRefreshWhenRunsSettle } from "./reviews";

afterEach(cleanup);

function setup(initial: string[] | undefined) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ ids }) => useRefreshWhenRunsSettle("pr1", ids), {
    wrapper,
    initialProps: { ids: initial },
  });
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
  return { ...hook, spy, keys };
}

describe("useRefreshWhenRunsSettle", () => {
  it("refreshes reviews, run history, PR detail and the PR list when a run leaves the active set", () => {
    const { rerender, keys } = setup([]);
    rerender({ ids: ["run-1"] }); // run started
    rerender({ ids: [] }); // run finished — the poll emptied
    expect(keys()).toEqual([["reviews", "pr1"], ["pr-runs", "pr1"], ["pull", "pr1"], ["pulls"]]);
  });

  it("does not refresh on first load or when a run merely starts", () => {
    const { rerender, spy } = setup([]);
    rerender({ ids: ["run-1"] });
    rerender({ ids: ["run-1", "run-2"] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refreshes when ONE of several parallel runs finishes (Run all agents)", () => {
    const { rerender, spy } = setup(["run-1", "run-2"]);
    rerender({ ids: ["run-2"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
  });

  it("ignores the loading state (undefined) instead of treating it as 'everything finished'", () => {
    const { rerender, spy } = setup(["run-1"]);
    rerender({ ids: undefined });
    expect(spy).not.toHaveBeenCalled();
  });
});
