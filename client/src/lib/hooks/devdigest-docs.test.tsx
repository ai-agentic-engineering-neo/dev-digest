import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { ApiError, api } from "../api";
import { devdigestErrorOf } from "../devdigest-docs";
import { notify } from "../toast";
import { contextDocsKey } from "./project-context";
import {
  devdigestDocKey,
  devdigestDocsKey,
  useCopyDevdigestDoc,
  useCreateDevdigestDoc,
  useDeleteDevdigestDoc,
  useSaveDevdigestDoc,
} from "./devdigest-docs";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const mocked = vi.mocked(api);

const doc = {
  id: "d1",
  repo_id: "r1",
  path: ".devdigest/specs/a.md",
  tokens: 3,
  copied_from: null,
  updated_at: "2026-01-01T00:00:00Z",
  content: "# a",
  used_by: [],
};

function setup() {
  const qc = createQueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, wrapper };
}

describe("devdigest-docs hooks", () => {
  beforeEach(() => {
    mocked.post.mockReset();
    mocked.put.mockReset();
    mocked.del.mockReset();
  });

  it("create caches the doc and invalidates both lists", async () => {
    mocked.post.mockResolvedValue(doc);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateDevdigestDoc("r1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ folder: "", name: "a" });
    });

    expect(mocked.post).toHaveBeenCalledWith("/repos/r1/devdigest-docs", { folder: "", name: "a" });
    expect(qc.getQueryData(devdigestDocKey("d1"))).toEqual(doc);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: devdigestDocsKey("r1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: contextDocsKey("r1") });
  });

  it("create and copy put the new doc into both list caches before they refetch (page selects it by path)", async () => {
    const { qc, wrapper } = setup();
    const other = { id: "d0", path: ".devdigest/specs/z.md", tokens: 1, copied_from: null, updated_at: "x" };
    qc.setQueryData(devdigestDocsKey("r1"), { repo_id: "r1", docs: [other], limit: 200, synced_at: null, ignored_repo_paths: 0 });
    qc.setQueryData(contextDocsKey("r1"), {
      repo_id: "r1",
      state: { status: "ready" },
      docs: [{ path: "README.md", source: "readme", tokens: 5, attached_agents: 0 }],
    });
    mocked.post.mockResolvedValueOnce(doc);
    const create = renderHook(() => useCreateDevdigestDoc("r1"), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ folder: "", name: "a" });
    });

    const copied = { ...doc, id: "d2", path: ".devdigest/specs/b.md", copied_from: "docs/b.md" };
    mocked.post.mockResolvedValueOnce({ created: true, doc: copied });
    const copy = renderHook(() => useCopyDevdigestDoc("r1"), { wrapper });
    await act(async () => {
      await copy.result.current.mutateAsync({ source_path: "docs/b.md" });
    });

    const dd = qc.getQueryData<{ docs: { id: string; path: string }[] }>(devdigestDocsKey("r1"));
    expect(dd?.docs.map((d) => d.id)).toEqual(["d1", "d2", "d0"]); // byte order by path
    const ctx = qc.getQueryData<{ docs: { path: string; source: string }[] }>(contextDocsKey("r1"));
    expect(ctx?.docs).toEqual([
      { path: ".devdigest/specs/a.md", source: "devdigest", tokens: 3, attached_agents: 0 },
      { path: ".devdigest/specs/b.md", source: "devdigest", tokens: 3, attached_agents: 0 },
      { path: "README.md", source: "readme", tokens: 5, attached_agents: 0 },
    ]);
  });

  it("save PUTs the content and a 422 surfaces as a too_large error without a global toast", async () => {
    const toast = vi.spyOn(notify, "error").mockImplementation(() => undefined);
    mocked.put.mockRejectedValueOnce(new ApiError("big", 422, "validation_error", { reason: "too_large" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveDevdigestDoc("r1"), { wrapper });

    let error: unknown;
    await act(async () => {
      await result.current.mutateAsync({ id: "d1", content: "x" }).catch((e: unknown) => {
        error = e;
      });
    });

    expect(mocked.put).toHaveBeenCalledWith("/devdigest-docs/d1", { content: "x" });
    expect(devdigestErrorOf(error)).toEqual({ reason: "too_large" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    toast.mockRestore();
  });

  it("delete removes the cached doc and invalidates agent attachments", async () => {
    mocked.del.mockResolvedValue({ deleted: "d1", detached_agents: 1 });
    const { qc, invalidate, wrapper } = setup();
    qc.setQueryData(devdigestDocKey("d1"), doc);
    const { result } = renderHook(() => useDeleteDevdigestDoc("r1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "d1" });
    });

    expect(mocked.del).toHaveBeenCalledWith("/devdigest-docs/d1");
    await waitFor(() => expect(qc.getQueryData(devdigestDocKey("d1"))).toBeUndefined());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent-context-docs"] });
  });

  it("delete drops the doc from both list caches before they refetch (the tree can't open a 404)", async () => {
    mocked.del.mockResolvedValue({ deleted: "d1", detached_agents: 0 });
    const { qc, wrapper } = setup();
    const other = { id: "d0", path: ".devdigest/specs/z.md", tokens: 1, copied_from: null, updated_at: "x" };
    const mine = { id: "d1", path: doc.path, tokens: 3, copied_from: null, updated_at: "x" };
    qc.setQueryData(devdigestDocsKey("r1"), { repo_id: "r1", docs: [mine, other], limit: 200, synced_at: null, ignored_repo_paths: 0 });
    qc.setQueryData(contextDocsKey("r1"), {
      repo_id: "r1",
      state: { status: "ready" },
      docs: [
        { path: doc.path, source: "devdigest", tokens: 3, attached_agents: 1 },
        { path: "README.md", source: "readme", tokens: 5, attached_agents: 0 },
      ],
    });
    const { result } = renderHook(() => useDeleteDevdigestDoc("r1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "d1" });
    });

    const dd = qc.getQueryData<{ docs: { id: string }[] }>(devdigestDocsKey("r1"));
    expect(dd?.docs.map((d) => d.id)).toEqual(["d0"]);
    const ctx = qc.getQueryData<{ docs: { path: string }[] }>(contextDocsKey("r1"));
    expect(ctx?.docs.map((d) => d.path)).toEqual(["README.md"]);
  });
});
