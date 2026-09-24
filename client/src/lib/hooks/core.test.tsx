import { describe, it, expect, afterEach } from "vitest";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { renderHookWithProviders, cleanup, act, createTestQueryClient } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { agentKeys, providerKeys, repoKeys, settingsKeys } from "./keys";
import { useRefreshRepo, useTestConnection, useUpdateSettings } from "./core";
import { useDeleteAgent, useUpdateAgent } from "./agents";
import { useResyncRepoIntel } from "./repo-intel";

afterEach(cleanup);

const invalidated = (qc: QueryClient, key: QueryKey) => qc.getQueryState(key)?.isInvalidated ?? false;

function seed(entries: QueryKey[]): QueryClient {
  const qc = createTestQueryClient();
  for (const key of entries) qc.setQueryData(key, { seeded: true });
  return qc;
}

describe("repo mutations", () => {
  it("useRefreshRepo refreshes the repo list and that repo's pulls only", async () => {
    mockFetch({ "POST /repos/r1/refresh": { id: "r1" } });
    const qc = seed([repoKeys.list(), repoKeys.pulls("r1"), repoKeys.pulls("r2"), repoKeys.context("r1")]);
    const { result } = renderHookWithProviders(() => useRefreshRepo(), { queryClient: qc });

    await act(() => result.current.mutateAsync("r1"));

    expect(invalidated(qc, repoKeys.list())).toBe(true);
    expect(invalidated(qc, repoKeys.pulls("r1"))).toBe(true);
    expect(invalidated(qc, repoKeys.pulls("r2"))).toBe(false);
    expect(invalidated(qc, repoKeys.context("r1"))).toBe(false);
  });

  it("useResyncRepoIntel refreshes that repo's index state", async () => {
    mockFetch({ "POST /repos/r1/resync": { status: "accepted" } });
    const qc = seed([repoKeys.intelState("r1"), repoKeys.intelState("r2")]);
    const { result } = renderHookWithProviders(() => useResyncRepoIntel("r1"), { queryClient: qc });

    await act(() => result.current.mutateAsync());

    expect(invalidated(qc, repoKeys.intelState("r1"))).toBe(true);
    expect(invalidated(qc, repoKeys.intelState("r2"))).toBe(false);
  });
});

describe("settings mutations", () => {
  it("a successful key test drops cached model lists and key-status badges", async () => {
    mockFetch({ "POST /settings/test-connection": { ok: true } });
    const qc = seed([providerKeys.models("openai"), providerKeys.models("openrouter"), settingsKeys.secretsStatus(), settingsKeys.current()]);
    const { result } = renderHookWithProviders(() => useTestConnection(), { queryClient: qc });

    await act(() => result.current.mutateAsync("openai"));

    expect(invalidated(qc, providerKeys.models("openai"))).toBe(true);
    expect(invalidated(qc, providerKeys.models("openrouter"))).toBe(true);
    expect(invalidated(qc, settingsKeys.secretsStatus())).toBe(true);
    expect(invalidated(qc, settingsKeys.current())).toBe(false);
  });

  it("useUpdateSettings writes the saved settings into the cache", async () => {
    mockFetch({ "PUT /settings": { polling_interval_min: 9 } });
    const qc = createTestQueryClient();
    const { result } = renderHookWithProviders(() => useUpdateSettings(), { queryClient: qc });

    await act(() => result.current.mutateAsync({ polling_interval_min: 9 }));

    expect(qc.getQueryData(settingsKeys.current())).toEqual({ polling_interval_min: 9 });
  });
});

describe("agent mutations", () => {
  it("useUpdateAgent caches the saved agent and refreshes the list", async () => {
    mockFetch({ "PUT /agents/ag1": { id: "ag1", name: "New" } });
    const qc = seed([agentKeys.list(), agentKeys.detail("ag2")]);
    const { result } = renderHookWithProviders(() => useUpdateAgent(), { queryClient: qc });

    await act(() => result.current.mutateAsync({ id: "ag1", patch: { name: "New" } }));

    expect(qc.getQueryData(agentKeys.detail("ag1"))).toEqual({ id: "ag1", name: "New" });
    expect(invalidated(qc, agentKeys.list())).toBe(true);
    expect(invalidated(qc, agentKeys.detail("ag2"))).toBe(false);
  });

  it("useDeleteAgent drops the agent from the cache and refreshes the list", async () => {
    mockFetch({ "DELETE /agents/ag1": { ok: true } });
    const qc = seed([agentKeys.list(), agentKeys.detail("ag1")]);
    const { result } = renderHookWithProviders(() => useDeleteAgent(), { queryClient: qc });

    await act(() => result.current.mutateAsync("ag1"));

    expect(qc.getQueryState(agentKeys.detail("ag1"))).toBeUndefined();
    expect(invalidated(qc, agentKeys.list())).toBe(true);
  });
});
