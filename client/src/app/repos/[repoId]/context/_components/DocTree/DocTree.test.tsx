import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc } from "@/lib/types";
import contextMessages from "../../../../../../../messages/en/context.json";
import { DocTree, type DocTreeProps } from "./DocTree";

const DOCS: ContextDoc[] = [
  { path: "docs/a.md", source: "docs", tokens: 120, attached_agents: 0 },
  { path: "server/specs/auth/b.md", source: "specs", tokens: 30, attached_agents: 0 },
  { path: "README.md", source: "readme", tokens: 10, attached_agents: 0 },
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

  it("shows every doc as a row: file name, area chip, folder line, tokens, full path as name", () => {
    const onSelectDoc = vi.fn();
    renderTree({ onSelectDoc, selectedPath: "docs/a.md" });

    const row = screen.getByRole("button", { name: /server\/specs\/auth\/b\.md/ });
    expect(row).toHaveAttribute("title", "server/specs/auth/b.md");
    expect(row).toHaveTextContent("b.md");
    expect(within(row).getByText("server")).toBeInTheDocument(); // area chip (exact text, not the folder line)
    expect(row).toHaveTextContent("server/specs/auth/"); // folder line
    expect(row).toHaveTextContent("~30 tokens");

    const root = screen.getByRole("button", { name: /^README\.md/ });
    expect(within(root).getByText("root")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /docs\/a\.md/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(row);
    expect(onSelectDoc).toHaveBeenCalledWith("server/specs/auth/b.md");
  });

  it("collapses a section and remembers it across remounts", async () => {
    const { unmount, ui, full } = renderTree();
    const docs = screen.getByRole("button", { name: /^Docs/ });
    expect(docs).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(docs);
    expect(docs).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /docs\/a\.md/ })).not.toBeInTheDocument();

    unmount();
    render(ui(full));
    expect(await screen.findByRole("button", { name: /^Docs/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /docs\/a\.md/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /server\/specs\/auth\/b\.md/ })).toBeInTheDocument();
  });

  it("section header is a focusable native button, so Enter toggles it (browser turns Enter into click)", () => {
    renderTree();
    const header = screen.getByRole("button", { name: /^Specs/ });
    expect(header.tagName).toBe("BUTTON");
    expect(header).toHaveAttribute("type", "button");
    header.focus();
    expect(header).toHaveFocus();
    // jsdom does not synthesize the click a real browser fires for Enter on a native button.
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.click(header);
    fireEvent.keyUp(header, { key: "Enter" });
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps sections open and hides non-matching docs while filtering", () => {
    window.localStorage.setItem("devdigest:context-tree:r1", JSON.stringify({ "specs:": false }));
    renderTree({ filter: "auth" });
    expect(screen.getByRole("button", { name: /^Specs/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /server\/specs\/auth\/b\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /docs\/a\.md/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Docs/ })).not.toBeInTheDocument();
  });

  it("lists devdigest folders (incl. an empty new one) as selectable targets", () => {
    const onSelectFolder = vi.fn();
    renderTree({ docs: [], extraFolders: ["drafts"], onSelectFolder, selectedFolder: "drafts" });
    expect(screen.getByRole("button", { name: /^\.devdigest \(editable\)/ })).toHaveAttribute("aria-expanded", "true");
    const folder = screen.getByRole("button", { name: "drafts" });
    expect(folder).toHaveAttribute("aria-current", "true");
    expect(folder).toHaveTextContent("drafts/");
    fireEvent.click(folder);
    expect(onSelectFolder).toHaveBeenCalledWith("drafts");
  });
});
