import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRefreshOnRunsSettled } from "./reviews";

function setup(initial: boolean) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(({ running }) => useRefreshOnRunsSettled("p1", running), {
    wrapper,
    initialProps: { running: initial },
  });
  return { spy, ...hook };
}

describe("useRefreshOnRunsSettled", () => {
  it("invalidates reviews and smart-diff when running goes true to false", () => {
    const { spy, rerender } = setup(true);
    rerender({ running: false });
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["reviews", "p1"]);
    expect(keys).toContainEqual(["smart-diff", "p1"]);
  });

  it("does nothing while idle, or when a run starts", () => {
    const { spy, rerender } = setup(false);
    rerender({ running: false });
    rerender({ running: true });
    expect(spy).not.toHaveBeenCalled();
  });
});
