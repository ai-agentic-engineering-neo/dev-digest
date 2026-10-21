import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextAttachment } from "@devdigest/shared";

const put = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: (...a: unknown[]) => put(...a) } }));

import { useSetContextAttachments } from "./project-context";

describe("useSetContextAttachments (AC-23)", () => {
  const before: ContextAttachment[] = [{ path: "a.md", order: 0, missing: false, too_large: false }];
  const key = ["context-attachments", "agent", "o1", "r1"];

  function setup() {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData(key, before);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
    return { qc, ...renderHook(() => useSetContextAttachments("agent"), { wrapper }) };
  }

  it("writes the new order at once and rolls it back when the server rejects it", async () => {
    let reject!: (e: Error) => void;
    put.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const { qc, result } = setup();
    act(() => result.current.mutate({ id: "o1", repoId: "r1", paths: ["a.md", "b.md"] }));
    await waitFor(() => expect((qc.getQueryData(key) as ContextAttachment[]).map((a) => a.path)).toEqual(["a.md", "b.md"]));
    expect(put).toHaveBeenCalledWith("/agents/o1/context", { repo_id: "r1", paths: ["a.md", "b.md"] });
    await act(async () => reject(new Error("422")));
    await waitFor(() => expect(qc.getQueryData(key)).toEqual(before));
  });

  it("stores what the server returns on success", async () => {
    const saved: ContextAttachment[] = [{ path: "b.md", order: 0, missing: false, too_large: false }];
    put.mockResolvedValueOnce(saved);
    const { qc, result } = setup();
    await act(async () => result.current.mutate({ id: "o1", repoId: "r1", paths: ["b.md"] }));
    await waitFor(() => expect(qc.getQueryData(key)).toEqual(saved));
  });
});

describe("override mutations (AC-62, AC-65)", () => {
  it("save PUTs the text, caches the answer and refetches the listing; reset DELETEs", async () => {
    const { useSaveContextFile, useResetContextFile } = await import("./project-context");
    const saved = { path: "docs/a.md", sha: "s", text: "new", modified: true, repo_text: "old", updated_at: "t" };
    const reset = { path: "docs/a.md", sha: "s", text: "old", modified: false };
    const put2 = vi.fn().mockResolvedValue(saved);
    const del = vi.fn().mockResolvedValue(reset);
    const apiMod = await import("@/lib/api");
    (apiMod.api as unknown as Record<string, unknown>).put = put2;
    (apiMod.api as unknown as Record<string, unknown>).del = del;
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
    const s = renderHook(() => useSaveContextFile(), { wrapper });
    await act(async () => s.result.current.mutate({ repoId: "r1", path: "docs/a.md", text: "new" }));
    await waitFor(() => expect(qc.getQueryData(["context-file", "r1", "docs/a.md"])).toEqual(saved));
    expect(put2).toHaveBeenCalledWith("/repos/r1/context/file", { path: "docs/a.md", text: "new" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context", "r1"] });
    const r = renderHook(() => useResetContextFile(), { wrapper });
    await act(async () => r.result.current.mutate({ repoId: "r1", path: "docs/a.md", text: "" }));
    await waitFor(() => expect(qc.getQueryData(["context-file", "r1", "docs/a.md"])).toEqual(reset));
    expect(del).toHaveBeenCalledWith("/repos/r1/context/file?path=docs%2Fa.md");
  });
});
