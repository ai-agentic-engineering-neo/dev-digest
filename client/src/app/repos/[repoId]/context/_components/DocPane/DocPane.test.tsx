import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import type { ContextDoc, DevdigestDoc } from "@/lib/types";
import contextMessages from "../../../../../../../messages/en/context.json";
import { DocPane, type DocPaneProps } from "./DocPane";

const copyMutate = vi.fn();
const saveMutate = vi.fn();
const deleteMutate = vi.fn();

let repoContent = "";
let ddDoc: DevdigestDoc;

vi.mock("@/lib/hooks/project-context", () => ({
  useContextDoc: (_repoId: string, path: string | null) => ({
    data: path ? { path, source: "docs", tokens: 120, attached_agents: 2, content: repoContent } : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/devdigest-docs", () => ({
  useDevdigestDoc: (id: string | null) => ({
    data: id ? ddDoc : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCopyDevdigestDoc: () => ({ mutate: copyMutate, isPending: false }),
  useSaveDevdigestDoc: () => ({ mutate: saveMutate, isPending: false }),
  useDeleteDevdigestDoc: () => ({ mutate: deleteMutate, isPending: false }),
}));

const REPO_DOC: ContextDoc = { path: "docs/a.md", source: "docs", tokens: 120, attached_agents: 2 };
const DD_DOC: ContextDoc = { path: ".devdigest/specs/x.md", source: "devdigest", tokens: 10, attached_agents: 2 };

function renderPane(props: Partial<DocPaneProps> = {}) {
  const full: DocPaneProps = {
    repoId: "r1",
    doc: REPO_DOC,
    devdigestId: null,
    mode: "preview",
    onModeChange: vi.fn(),
    copyExists: false,
    onCopied: vi.fn(),
    onDeleted: vi.fn(),
    onDirtyChange: vi.fn(),
    ...props,
  };
  const tree = (p: DocPaneProps) => (
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <DocPane {...p} />
    </NextIntlClientProvider>
  );
  const view = render(tree(full));
  return { ...full, rerenderWith: (next: Partial<DocPaneProps>) => view.rerender(tree({ ...full, ...next })) };
}

describe("DocPane", () => {
  beforeEach(() => {
    repoContent = "# A\n## B\n### C\n- x\n1. y\n`c`\n\n<script>alert(1)</script>";
    ddDoc = {
      id: "d1",
      repo_id: "r1",
      path: DD_DOC.path,
      tokens: 10,
      copied_from: "specs/a.md",
      updated_at: "2026-11-08T00:00:00Z",
      content: "# Saved",
      used_by: [
        { id: "a1", name: "Security" },
        { id: "a2", name: "Style" },
      ],
    };
    copyMutate.mockReset();
    saveMutate.mockReset();
    deleteMutate.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("repo doc: read-only header, markdown preview as text, copy to edit", () => {
    const props = renderPane();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("~120 tokens")).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "View mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "C" })).toBeInTheDocument();
    expect(screen.getByText("c").tagName).toBe("CODE");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy to .devdigest/ to edit" }));
    expect(copyMutate).toHaveBeenCalledWith({ source_path: "docs/a.md" }, expect.anything());
    const opts = copyMutate.mock.calls[0]?.[1] as { onSuccess: (r: unknown) => void };
    const result = { created: true, doc: ddDoc };
    act(() => opts.onSuccess(result));
    expect(props.onCopied).toHaveBeenCalledWith(result);
  });

  it("devdigest doc: edit, preview the draft, save, and the too-large error keeps the draft", () => {
    const onDirtyChange = vi.fn();
    renderPane({ doc: DD_DOC, devdigestId: "d1", mode: "edit", onDirtyChange });
    expect(screen.getByText("Copied from specs/a.md")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: /Markdown source of/ });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(box, { target: { value: "# Draft" } });
    expect(save).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(save);
    expect(saveMutate).toHaveBeenCalledWith({ id: "d1", content: "# Draft" }, expect.anything());
    const opts = saveMutate.mock.calls[0]?.[1] as {
      onError: (e: Error) => void;
      onSuccess: () => void;
    };
    act(() => opts.onError(new ApiError("too big", 422, "validation_error", { reason: "too_large" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Over the 1 MB limit.");
    expect(screen.getByRole("textbox", { name: /Markdown source of/ })).toHaveValue("# Draft");
  });

  it("devdigest doc: copy notice, delete confirm names agents", () => {
    const onDeleted = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPane({ doc: DD_DOC, devdigestId: "d1", mode: "edit", copyExists: true, onDeleted });
    expect(screen.getByText("A copy already exists — opened it unchanged.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: `Delete ${DD_DOC.path}` }));
    const message = confirm.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("2 agents");
    expect(message).toContain("Security, Style");
    expect(deleteMutate).toHaveBeenCalledWith({ id: "d1" }, expect.anything());
    act(() => (deleteMutate.mock.calls[0]?.[1] as { onSuccess: () => void }).onSuccess());
    expect(onDeleted).toHaveBeenCalled();
  });

  it("devdigest doc: preview renders the unsaved draft, and a successful save clears the dirty state", () => {
    const props = renderPane({ doc: DD_DOC, devdigestId: "d1", mode: "edit" });
    fireEvent.change(screen.getByRole("textbox", { name: /Markdown source of/ }), {
      target: { value: "# Unsaved heading" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(props.onModeChange).toHaveBeenCalledWith("preview");
    props.rerenderWith({ mode: "preview" });
    expect(screen.getByRole("heading", { level: 1, name: "Unsaved heading" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Saved" })).not.toBeInTheDocument();

    props.rerenderWith({ mode: "edit" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    const opts = saveMutate.mock.calls[0]?.[1] as { onSuccess: (d: DevdigestDoc) => void };
    ddDoc = { ...ddDoc, content: "# Unsaved heading" };
    act(() => opts.onSuccess(ddDoc));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("keeps text typed while a save is in flight instead of replacing it with the saved content", () => {
    const props = renderPane({ doc: DD_DOC, devdigestId: "d1", mode: "edit" });
    const box = () => screen.getByRole("textbox", { name: /Markdown source of/ });
    fireEvent.change(box(), { target: { value: "# First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveMutate).toHaveBeenCalledWith({ id: "d1", content: "# First" }, expect.anything());

    fireEvent.change(box(), { target: { value: "# First more" } }); // typed before the response
    const opts = saveMutate.mock.calls[0]?.[1] as { onSuccess: (d: DevdigestDoc) => void };
    ddDoc = { ...ddDoc, content: "# First" };
    act(() => opts.onSuccess(ddDoc));
    props.rerenderWith({});

    expect(box()).toHaveValue("# First more");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("guards unload and in-app links only while dirty", () => {
    renderPane({ doc: DD_DOC, devdigestId: "d1", mode: "edit" });
    const link = document.body.appendChild(document.createElement("a"));
    link.href = "/agents";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.click(link);
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: /Markdown source of/ }), {
      target: { value: "changed" },
    });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalled();
    link.remove();
  });
});
