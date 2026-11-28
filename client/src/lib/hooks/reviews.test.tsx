import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRunReview } from "./reviews";
import { queryKeys } from "./query-keys";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe("useRunReview", () => {
  it("refreshes the PR's live runs, run history and reviews once the run starts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ runs: [{ run_id: "r1", agent_id: "a1" }] }, { status: 202 })),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRunReview(), { wrapper });

    await act(() => result.current.mutateAsync({ prId: "pr1", all: true }));

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.prActiveRuns("pr1"),
        queryKeys.prRuns("pr1"),
        queryKeys.reviews("pr1"),
      ]),
    );
  });

  it("invalidates nothing when starting the run fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "no agents" } }, { status: 400 })));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRunReview(), { wrapper });

    await act(() => result.current.mutateAsync({ prId: "pr1", all: true }).catch(() => undefined));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
