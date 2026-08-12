import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AttachedDocument, Skill } from "@devdigest/shared";

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
// only needs to prove it wires the SKILL-specific bits into that shared
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

const SKILL: Skill = {
  id: "skill-1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Body",
  enabled: true,
  version: 1,
  evidence_files: null,
};

describe("ContextTab (skill editor wrapper)", () => {
  it("fetches attachments for this skill via the generic entity hook and passes the skills namespace + active repo down", () => {
    render(<ContextTab skill={SKILL} />);

    expect(useEntityDocuments).toHaveBeenCalledWith("skill", "skill-1");
    expect(lastProps).toMatchObject({ namespace: "skills", repoId: "repo-1" });
  });

  it("onToggle resolves to PUT /skills/:id/documents (via the generic entity mutation, keyed by skillId)", () => {
    render(<ContextTab skill={SKILL} />);

    (lastProps!.onToggle as (path: string, attached: boolean) => void)("docs/b.md", true);
    expect(setAttachedMutate).toHaveBeenCalledWith({
      id: "skill-1",
      repoId: "repo-1",
      path: "docs/b.md",
      attached: true,
    });
  });

  it("onReorder resolves to POST /skills/:id/documents, forwarding onSettled", () => {
    render(<ContextTab skill={SKILL} />);

    const onSettled = vi.fn();
    const documents = [{ repo_id: "repo-1", path: "specs/a.md" }];
    (
      lastProps!.onReorder as (
        documents: { repo_id: string; path: string }[],
        opts: { onSettled: () => void },
      ) => void
    )(documents, { onSettled });

    expect(setDocumentsMutate).toHaveBeenCalledWith({ id: "skill-1", documents }, { onSettled });
  });

  it("D3 — an already-attached skill's repo pins the tab to the attachment's own repo, not whatever repo is active in the shell", () => {
    useEntityDocuments.mockReturnValueOnce({
      data: [{ repo_id: "repo-2", path: "docs/b.md", order: 0, attached: true, tokens: 10, status: "present" }],
    });
    render(<ContextTab skill={SKILL} />);

    // The shell's active repo is "repo-1" (mocked above), but this skill's
    // own attachment is pinned to "repo-2" — the tab must resolve/mutate
    // against "repo-2", never silently target the shell's repo instead.
    expect(lastProps).toMatchObject({ repoId: "repo-2" });

    (lastProps!.onToggle as (path: string, attached: boolean) => void)("docs/b.md", false);
    expect(setAttachedMutate).toHaveBeenCalledWith({
      id: "skill-1",
      repoId: "repo-2",
      path: "docs/b.md",
      attached: false,
    });
  });
});
