import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AttachedDocument, DocumentList } from "@devdigest/shared";
import agentsMessages from "../../../../messages/en/agents.json";
import skillsMessages from "../../../../messages/en/skills.json";

vi.mock("@/lib/hooks/project-context", () => ({
  useRepoDocuments: () => ({ data: CATALOG }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CATALOG: DocumentList = {
  roots: ["specs", "docs"],
  documents: [
    { path: "specs/a.md", doc_type: "specs", tokens: 100, used_by: 1 },
    { path: "docs/b.md", doc_type: "docs", tokens: 50, used_by: 0 },
    { path: "specs/c.md", doc_type: "specs", tokens: 30, used_by: 0 },
  ],
  summary: { count: 3, tokens: 180, bounded: 0 },
};

// specs/a.md is attached; docs/b.md is a detached-but-kept link (AC-10);
// old/removed.md is attached but no longer in the discovery catalog (AC-26).
const ATTACHMENTS: AttachedDocument[] = [
  { repo_id: "repo-1", path: "specs/a.md", order: 0, attached: true, tokens: 100, status: "present" },
  { repo_id: "repo-1", path: "old/removed.md", order: 1, attached: true, tokens: 0, status: "missing" },
  { repo_id: "repo-1", path: "docs/b.md", order: 2, attached: false, tokens: 50, status: "present" },
];

function renderWithIntl(ui: React.ReactElement, namespace: "agents" | "skills" = "agents") {
  const messages = namespace === "agents" ? agentsMessages : skillsMessages;
  return render(
    <NextIntlClientProvider locale="en" messages={{ [namespace]: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (shared — used by both the agent editor and the skill editor)", () => {
  it("lists every discovered + attached document, checks exactly the attached ones, and marks a since-deleted attachment as missing", () => {
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: "specs/a.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "old/removed.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "docs/b.md" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "specs/c.md" })).not.toBeChecked();

    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("2 of 4 attached")).toBeInTheDocument();
    // 100 (specs/a.md) + 0 (old/removed.md, missing → tokens 0) = 100.
    expect(screen.getByText("100 tokens attached")).toBeInTheDocument();
  });

  it("checking a row calls onToggle, keeping the running token total unaffected by the filter", () => {
    const onToggle = vi.fn();
    const onReorder = vi.fn();
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={onToggle} onReorder={onReorder} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "specs/c.md" }));
    expect(onToggle).toHaveBeenCalledWith("specs/c.md", true);
    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), {
      target: { value: "specs" },
    });
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.queryByText("docs/b.md")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 attached")).toBeInTheDocument();
    // The token total is over the WHOLE attached set, not the filtered view.
    expect(screen.getByText("100 tokens attached")).toBeInTheDocument();
  });

  it("announces the new attached-count and token-total when a row is toggled", () => {
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={vi.fn()} />,
    );

    // Attaching specs/c.md (30 tokens): 3 of 4 attached, 130 tokens total.
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/c.md" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Attached specs/c.md. 3 of 4 attached, 130 tokens attached.",
    );

    // Detaching specs/a.md (100 tokens) off the ORIGINAL attachment set (the
    // spy onToggle never actually updates it): 1 of 4 attached (old/removed.md
    // only), 0 tokens left (old/removed.md is missing → counted as 0).
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/a.md" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Detached specs/a.md. 1 of 4 attached, 0 tokens attached.",
    );
  });

  it("dragging one row onto another calls onReorder with the whole attached set, repo-scoped, and clears pendingOrder via onSettled", () => {
    const onReorder = vi.fn((_documents, opts: { onSettled: () => void }) => opts.onSettled());
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={onReorder} />,
    );

    const fromHandle = screen.getByRole("button", { name: "Reorder old/removed.md, position 2 of 2" });
    const toHandle = screen.getByRole("button", { name: "Reorder specs/a.md, position 1 of 2" });
    // The drag handle is a direct child of the per-row wrapping div that
    // carries the onDrop handler.
    const toRow = toHandle.parentElement!;

    fireEvent.dragStart(fromHandle);
    fireEvent.drop(toRow);

    expect(onReorder).toHaveBeenCalledWith(
      [
        { repo_id: "repo-1", path: "old/removed.md" },
        { repo_id: "repo-1", path: "specs/a.md" },
      ],
      { onSettled: expect.any(Function) },
    );
  });

  it("keyboard reordering (ArrowDown on the drag handle) calls onReorder and announces the new position", () => {
    const onReorder = vi.fn((_documents, opts: { onSettled: () => void }) => opts.onSettled());
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={onReorder} />,
    );

    // Attached rows in order: specs/a.md (position 1 of 2), old/removed.md
    // (position 2 of 2) — ArrowDown on specs/a.md's handle should swap them.
    const handle = screen.getByRole("button", { name: "Reorder specs/a.md, position 1 of 2" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });

    expect(onReorder).toHaveBeenCalledWith(
      [
        { repo_id: "repo-1", path: "old/removed.md" },
        { repo_id: "repo-1", path: "specs/a.md" },
      ],
      { onSettled: expect.any(Function) },
    );
    // Reorder is a distinct announcement from attach/detach (AC-21's position
    // is the thing being communicated, not a count/token total).
    expect(screen.getByRole("status")).toHaveTextContent("Moved specs/a.md to position 2 of 2");
  });

  it("ArrowUp/ArrowDown on a non-reorder key does nothing (only the two arrow keys drive keyboard reordering)", () => {
    const onReorder = vi.fn();
    renderWithIntl(
      <ContextTab namespace="agents" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={onReorder} />,
    );
    const handle = screen.getByRole("button", { name: "Reorder specs/a.md, position 1 of 2" });
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("renders no interactive list when repoId is null", () => {
    renderWithIntl(
      <ContextTab namespace="agents" repoId={null} attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={vi.fn()} />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(agentsMessages.context.noRepo)).toBeInTheDocument();
  });

  it("is parameterized by namespace — the same props render the skill editor's wording under the skills message file", () => {
    renderWithIntl(
      <ContextTab namespace="skills" repoId="repo-1" attachments={ATTACHMENTS} onToggle={vi.fn()} onReorder={vi.fn()} />,
      "skills",
    );
    expect(screen.getByText(skillsMessages.context.orderHint)).toBeInTheDocument();
    expect(agentsMessages.context.orderHint).not.toBe(skillsMessages.context.orderHint);
  });
});
