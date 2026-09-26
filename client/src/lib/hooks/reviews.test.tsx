/**
 * Smart Order (L03): `useFindingAction` invalidates BOTH the reviews list and
 * the smart-diff response on success, so a dot/chip/card update immediately
 * after accept/dismiss. `api.post` is mocked (same module the hook imports,
 * `../api`) so no real fetch happens; `QueryClient.invalidateQueries` is
 * spied on directly rather than asserting on cache state.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("../api", () => ({
  api: { post: vi.fn(() => Promise.resolve({ finding: { id: "f1" } })) },
  API_BASE: "http://localhost:3001",
}));

import { useFindingAction } from "./reviews";

afterEach(cleanup);

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useFindingAction", () => {
  it("invalidates both [\"reviews\", prId] and [\"smart-diff\", prId] on success", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useFindingAction(), { wrapper: wrapperFor(qc) });

    await act(async () => {
      result.current.mutate({ findingId: "f1", action: "dismiss", prId: "p1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "p1"] });
  });
});
