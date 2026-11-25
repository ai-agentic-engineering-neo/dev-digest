/* Mutation hooks invalidate exactly the cache entries they own. The cache is
   seeded with several entries; after the mutation we read each entry's
   isInvalidated flag, so an over- or under-broad invalidation fails. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { useDeleteReview, useDeleteRun } from "./reviews";
import { agentQueries, useDeleteAgent, useUpdateAgent } from "./agents";
import { useTestConnection } from "./core";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let qc: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Seed every key with data so it exists in the cache (no observers → no refetch). */
function seed(keys: QueryKey[]) {
  for (const k of keys) qc.setQueryData(k, { seeded: true });
}

function invalidated(keys: QueryKey[]) {
  return keys.filter((k) => qc.getQueryState(k)?.isInvalidated);
}

const SEEDED: QueryKey[] = [
  ["pr-runs", "p1"],
  ["pr-runs", "p2"],
  ["reviews", "p1"],
  ["reviews", "p2"],
  ["pr-active-runs", "p1"],
  ["pr-comments", "p1"],
  ["agents"],
  ["agent", "a1"],
  ["agent", "a2"],
  ["provider-models", "openai"],
  ["provider-models", "anthropic"],
  ["secrets-status"],
  ["settings"],
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  seed(SEEDED);
});

afterEach(() => {
  qc.clear();
  vi.unstubAllGlobals();
});

describe("reviews mutations", () => {
  it("useDeleteRun deletes the run and invalidates only this PR's runs + reviews", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const { result } = renderHook(() => useDeleteRun("p1"), { wrapper });

    await act(() => result.current.mutateAsync("run-7"));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/runs\/run-7$/),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidated(SEEDED)).toEqual([
      ["pr-runs", "p1"],
      ["reviews", "p1"],
    ]);
  });

  it("useDeleteReview invalidates only this PR's reviews", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const { result } = renderHook(() => useDeleteReview("p1"), { wrapper });

    await act(() => result.current.mutateAsync("rev-1"));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/reviews\/rev-1$/),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidated(SEEDED)).toEqual([["reviews", "p1"]]);
  });

  it("a failed delete invalidates nothing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "not_found", message: "gone" } }), { status: 404 }),
    );
    const { result } = renderHook(() => useDeleteRun("p1"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("run-x")).rejects.toMatchObject({ status: 404 });
    });
    expect(invalidated(SEEDED)).toEqual([]);
  });
});

describe("agents mutations", () => {
  it("useUpdateAgent invalidates the list and writes the returned agent into its detail cache", async () => {
    const updated = { id: "a1", name: "Renamed" };
    fetchMock.mockResolvedValueOnce(json(updated));
    const { result } = renderHook(() => useUpdateAgent(), { wrapper });

    await act(() => result.current.mutateAsync({ id: "a1", patch: { name: "Renamed" } }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/agents\/a1$/),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "Renamed" }) }),
    );
    expect(invalidated(SEEDED)).toEqual([["agents"]]);
    expect(qc.getQueryData(agentQueries.detail("a1").queryKey)).toEqual(updated);
  });

  it("useDeleteAgent invalidates the list and removes only that agent's detail entry", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    const { result } = renderHook(() => useDeleteAgent(), { wrapper });

    await act(() => result.current.mutateAsync("a1"));

    expect(invalidated(SEEDED)).toEqual([["agents"]]);
    expect(qc.getQueryState(["agent", "a1"])).toBeUndefined();
    expect(qc.getQueryState(["agent", "a2"])).toBeDefined();
  });
});

describe("core mutations", () => {
  it("useTestConnection invalidates every provider model list + key status only when ok", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: false, error: "bad key" }));
    const { result } = renderHook(() => useTestConnection(), { wrapper });

    await act(() => result.current.mutateAsync("openai"));
    expect(invalidated(SEEDED)).toEqual([]);

    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await act(() => result.current.mutateAsync({ provider: "openai", key: "test-key" }));
    expect(invalidated(SEEDED)).toEqual([
      ["provider-models", "openai"],
      ["provider-models", "anthropic"],
      ["secrets-status"],
    ]);
    const [, init] = fetchMock.mock.calls[1]!;
    expect(init?.body).toBe(JSON.stringify({ provider: "openai", key: "test-key" }));
  });
});
