import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentContextDocs, ContextDocList } from "../types";
import {
  useAgentContextDocs,
  useContextDoc,
  useContextDocs,
  useSetAgentContextDocs,
} from "./project-context";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../api", () => ({ api: { get, put } }));

const AGENT = "agent-1";
const REPO = "repo-1";
const KEY = ["agent-context-docs", AGENT, REPO];

const BEFORE: AgentContextDocs = {
  agent_id: AGENT,
  repo_id: REPO,
  docs: [
    { path: "docs/a.md", position: 0, status: "ok", source: "docs", tokens: 10 },
    { path: "docs/b.md", position: 1, status: "ok", source: "docs", tokens: 20 },
  ],
};
const LIST: ContextDocList = {
  repo_id: REPO,
  state: { status: "ready" },
  docs: [
    { path: "docs/a.md", source: "docs", tokens: 10, attached_agents: 1 },
    { path: "docs/b.md", source: "docs", tokens: 20, attached_agents: 1 },
    { path: "specs/c.md", source: "specs", tokens: 30, attached_agents: 0 },
  ],
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(KEY, BEFORE);
  qc.setQueryData(["context-docs", REPO], LIST);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe("project-context queries", () => {
  it("GET the repo docs, one doc (path URL-encoded) and an agent's attachments", async () => {
    get.mockResolvedValue({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useContextDocs(REPO), { wrapper });
    renderHook(() => useContextDoc(REPO, "docs/a b.md"), { wrapper });
    renderHook(() => useAgentContextDocs(AGENT, REPO), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(get).toHaveBeenCalledWith(`/repos/${REPO}/context-docs`);
    expect(get).toHaveBeenCalledWith(`/repos/${REPO}/context-docs/content?path=docs%2Fa%20b.md`);
    expect(get).toHaveBeenCalledWith(`/agents/${AGENT}/context-docs?repo_id=${REPO}`);
  });

  it("does not fetch a doc without a path or a repo", () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useContextDoc(REPO, null), { wrapper });
    renderHook(() => useContextDocs(null), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useSetAgentContextDocs", () => {
  it("PUTs { repo_id, paths }, applies the new order optimistically and stores the saved result", async () => {
    const { qc, wrapper } = setup();
    let release!: (v: AgentContextDocs) => void;
    const SAVED: AgentContextDocs = {
      ...BEFORE,
      docs: [
        { path: "specs/c.md", position: 0, status: "ok", source: "specs", tokens: 30 },
        { path: "docs/a.md", position: 1, status: "ok", source: "docs", tokens: 10 },
      ],
    };
    put.mockImplementation(() => new Promise((r) => (release = r)));
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetAgentContextDocs(AGENT, REPO), { wrapper });

    result.current.mutate(["specs/c.md", "docs/a.md"]);

    await waitFor(() =>
      expect(qc.getQueryData<AgentContextDocs>(KEY)?.docs.map((d) => [d.path, d.position, d.tokens])).toEqual([
        ["specs/c.md", 0, 30],
        ["docs/a.md", 1, 10],
      ]),
    );
    expect(put).toHaveBeenCalledWith(`/agents/${AGENT}/context-docs`, {
      repo_id: REPO,
      paths: ["specs/c.md", "docs/a.md"],
    });

    release(SAVED);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(KEY)).toEqual(SAVED);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent-context-docs", AGENT, REPO] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["context-docs", REPO] });
  });

  it("runs overlapping saves one at a time and keeps the newest optimistic list until the last one settles", async () => {
    const { qc, wrapper } = setup();
    const releases: Array<(v: AgentContextDocs) => void> = [];
    put.mockImplementation(() => new Promise((r) => releases.push(r)));
    const { result } = renderHook(() => useSetAgentContextDocs(AGENT, REPO), { wrapper });
    const paths = () => qc.getQueryData<AgentContextDocs>(KEY)?.docs.map((d) => d.path);
    const saved = (p: string[]): AgentContextDocs => ({
      ...BEFORE,
      docs: p.map((path, position) => ({ path, position, status: "ok", source: "docs", tokens: 1 })),
    });

    // two quick clicks: attach c, then (computed from the optimistic list) detach b
    result.current.mutate(["docs/a.md", "docs/b.md", "specs/c.md"]);
    await waitFor(() => expect(paths()).toEqual(["docs/a.md", "docs/b.md", "specs/c.md"]));
    result.current.mutate(["docs/a.md", "specs/c.md"]);
    await waitFor(() => expect(paths()).toEqual(["docs/a.md", "specs/c.md"]));

    // the second PUT waits for the first (no out-of-order writes on the server)
    expect(put).toHaveBeenCalledTimes(1);

    // the first save settling must not overwrite the newer optimistic list
    releases[0]!(saved(["docs/a.md", "docs/b.md", "specs/c.md"]));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(paths()).toEqual(["docs/a.md", "specs/c.md"]);
    expect(put).toHaveBeenLastCalledWith(`/agents/${AGENT}/context-docs`, {
      repo_id: REPO,
      paths: ["docs/a.md", "specs/c.md"],
    });

    // the last save's result wins
    releases[1]!(saved(["docs/a.md", "specs/c.md"]));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(paths()).toEqual(["docs/a.md", "specs/c.md"]);
  });

  it("rolls back to the previous attachments on error", async () => {
    const { qc, wrapper } = setup();
    put.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSetAgentContextDocs(AGENT, REPO), { wrapper });

    result.current.mutate([]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(KEY)).toEqual(BEFORE);
  });
});
