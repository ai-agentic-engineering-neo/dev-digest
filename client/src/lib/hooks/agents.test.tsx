import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hasOwnErrorToast } from "../error-message";
import { useDeleteAgent } from "./agents";

vi.mock("../api", () => ({ api: { del: vi.fn(async () => Promise.reject(new Error("in use"))) } }));

describe("useDeleteAgent", () => {
  it("opts out of the global error toast — DeleteAgentDialog shows the error itself", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteAgent(), { wrapper });
    result.current.mutate("ag1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    // The provider's MutationCache.onError skips mutations carrying this meta.
    const mutation = qc.getMutationCache().getAll()[0]!;
    expect(hasOwnErrorToast(mutation.options.meta as Record<string, unknown> | undefined)).toBe(true);
  });
});
