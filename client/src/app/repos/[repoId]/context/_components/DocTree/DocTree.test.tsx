import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc } from "@/lib/types";
import contextMessages from "../../../../../../../messages/en/context.json";
import { DocTree, type DocTreeProps } from "./DocTree";

const DOCS: ContextDoc[] = [
  { path: "docs/a.md", source: "docs", tokens: 120, attached_agents: 0 },
  { path: "server/specs/auth/b.md", source: "specs", tokens: 30, attached_agents: 0 },
];

function renderTree(props: Partial<DocTreeProps> = {}) {
  const full: DocTreeProps = {
    repoId: "r1",
    docs: DOCS,
    extraFolders: [],
    filter: "",
    selectedPath: null,
    selectedFolder: null,
    onSelectDoc: vi.fn(),
    onSelectFolder: vi.fn(),
    ...props,
  };
  const ui = (p: DocTreeProps) => (
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <DocTree {...p} />
    </NextIntlClientProvider>
  );
  const result = render(ui(full));
  return { ...result, full, ui };
}

describe("DocTree", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("expands a folder, remembers it across remounts and exposes the full path on doc rows", async () => {
    const { unmount, ui, full } = renderTree();
    const folder = screen.getByRole("button", { name: "docs" });
    expect(folder).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(folder);
    const row = screen.getByRole("button", { name: /docs\/a\.md/ });
    expect(row).toHaveAttribute("title", "docs/a.md");
    expect(row).toHaveTextContent("a.md");
    expect(row).toHaveTextContent("~120 tokens");

    unmount();
    render(ui(full));
    expect(await screen.findByRole("button", { name: /docs\/a\.md/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
  });

  it("folder is a focusable native button, so Enter toggles it (browser turns Enter into click)", () => {
    renderTree();
    const folder = screen.getByRole("button", { name: "docs" });
    expect(folder.tagName).toBe("BUTTON");
    expect(folder).toHaveAttribute("type", "button");
    expect(folder).toHaveAttribute("aria-expanded", "false");

    folder.focus();
    expect(folder).toHaveFocus();
    // jsdom does not synthesize the click a real browser fires for Enter on a native button.
    fireEvent.keyDown(folder, { key: "Enter" });
    fireEvent.click(folder);
    fireEvent.keyUp(folder, { key: "Enter" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "false");
  });

  it("opens everything and hides non-matching docs while filtering", () => {
    renderTree({ filter: "auth" });
    expect(screen.getByRole("button", { name: "auth" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /server\/specs\/auth\/b\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /docs\/a\.md/ })).not.toBeInTheDocument();
  });

  it("selects an empty devdigest folder as the target", () => {
    const onSelectFolder = vi.fn();
    renderTree({ docs: [], extraFolders: ["drafts"], onSelectFolder });
    expect(screen.getByRole("button", { name: ".devdigest (editable)" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "drafts" }));
    expect(onSelectFolder).toHaveBeenCalledWith("drafts");
  });
});
