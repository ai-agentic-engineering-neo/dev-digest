import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Agent, AttachedDocument } from "@devdigest/shared";

const setAttachedMutate = vi.fn();
const setDocumentsMutate = vi.fn();
const useEntityDocuments = vi.fn((): { data: AttachedDocument[] } => ({ data: [] }));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/widgets" } }),
}));

vi.mock("@/lib/hooks/project-context", () => ({
  useEntityDocuments: (...args: unknown[]) => useEntityDocuments(...(args as [])),
  useSetEntityDocumentAttached: () => ({ mutate: setAttachedMutate }),
  useSetEntityDocuments: () => ({ mutate: setDocumentsMutate }),
}));

// The shared ContextTab is covered end-to-end by its own test
// (src/components/context-tab/ContextTab/ContextTab.test.tsx). This wrapper
// only needs to prove it wires the AGENT-specific bits into that shared
// component correctly, so it's mocked to a prop recorder.
let lastProps: Record<string, unknown> | null = null;
vi.mock("@/components/context-tab", () => ({
  ContextTab: (props: Record<string, unknown>) => {
    lastProps = props;
    return null;
  },
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  lastProps = null;
});

const AGENT: Agent = {
  id: "agent-1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

describe("ContextTab (agent editor wrapper)", () => {
  it("fetches attachments for this agent via the generic entity hook and passes the agents namespace + active repo down", () => {
    render(<ContextTab agent={AGENT} />);

    expect(useEntityDocuments).toHaveBeenCalledWith("agent", "agent-1");
    expect(lastProps).toMatchObject({ namespace: "agents", repoId: "repo-1" });
  });

  it("onToggle resolves to PUT /agents/:id/documents (via the generic entity mutation, keyed by agentId)", () => {
    render(<ContextTab agent={AGENT} />);

    (lastProps!.onToggle as (path: string, attached: boolean) => void)("specs/c.md", true);
    expect(setAttachedMutate).toHaveBeenCalledWith({
      id: "agent-1",
      repoId: "repo-1",
      path: "specs/c.md",
      attached: true,
    });
  });

  it("onReorder resolves to POST /agents/:id/documents, forwarding onSettled", () => {
    render(<ContextTab agent={AGENT} />);

    const onSettled = vi.fn();
    const documents = [{ repo_id: "repo-1", path: "specs/a.md" }];
    (
      lastProps!.onReorder as (
        documents: { repo_id: string; path: string }[],
        opts: { onSettled: () => void },
      ) => void
    )(documents, { onSettled });

    expect(setDocumentsMutate).toHaveBeenCalledWith({ id: "agent-1", documents }, { onSettled });
  });

  it("D3 — an already-attached agent's repo pins the tab to the attachment's own repo, not whatever repo is active in the shell", () => {
    useEntityDocuments.mockReturnValueOnce({
      data: [{ repo_id: "repo-2", path: "specs/a.md", order: 0, attached: true, tokens: 10, status: "present" }],
    });
    render(<ContextTab agent={AGENT} />);

    // The shell's active repo is "repo-1" (mocked above), but this agent's
    // own attachment is pinned to "repo-2" — the tab must resolve/mutate
    // against "repo-2", never silently target the shell's repo instead.
    expect(lastProps).toMatchObject({ repoId: "repo-2" });

    (lastProps!.onToggle as (path: string, attached: boolean) => void)("specs/a.md", false);
    expect(setAttachedMutate).toHaveBeenCalledWith({
      id: "agent-1",
      repoId: "repo-2",
      path: "specs/a.md",
      attached: false,
    });
  });
});
