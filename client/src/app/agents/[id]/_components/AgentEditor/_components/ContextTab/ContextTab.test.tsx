import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { AgentContextDoc, ContextDocContent, ContextDocList } from "@/lib/types";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

/* Agent editor · Context tab (SPEC-01 behaviour, SPEC-04 N2b layout) — hooks and repo context are
   mocked; saves are asserted on the mutation. */

const mutate = vi.fn();
const resyncStart = vi.fn();
let docsList: ContextDocList;
let attached: AgentContextDoc[] = [];
let repoId: string | null = "r1";
let docContent: ContextDocContent | undefined;

const DOCS: ContextDocList["docs"] = [
  { path: "README.md", source: "readme", tokens: 100, attached_agents: 0 },
  { path: "docs/a.md", source: "docs", tokens: 3000, attached_agents: 1 },
  { path: "docs/b.md", source: "docs", tokens: 1500, attached_agents: 1 },
  { path: "server/specs/auth.md", source: "specs", tokens: 300, attached_agents: 0 },
  { path: "specs/huge.md", source: "specs", tokens: 5000, attached_agents: 0 },
];
const READY: ContextDocList = { repo_id: "r1", state: { status: "ready" }, docs: DOCS };

const ok = (path: string, position: number): AgentContextDoc => {
  const d = DOCS.find((x) => x.path === path)!;
  return { path, position, status: "ok", source: d.source, tokens: d.tokens };
};

vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: () => ({ data: docsList, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentContextDocs: () => ({
    data: { agent_id: "ag1", repo_id: "r1", docs: attached },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSetAgentContextDocs: () => ({ mutate, isPending: false }),
  useContextDoc: () => ({ data: docContent, isLoading: false, isError: false, refetch: vi.fn() }),
  useContextResync: () => ({ start: resyncStart, busy: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId,
    activeRepo: repoId ? { id: repoId, name: "payments-api", full_name: "acme/payments-api" } : null,
  }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  resyncStart.mockReset();
  docsList = READY;
  attached = [];
  repoId = "r1";
  docContent = undefined;
});
docsList = READY;

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function tree() {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
      <ToastProvider>
        <ContextTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

function renderTab() {
  return render(tree());
}

const rowPaths = () => screen.getAllByRole("listitem").map((r) => r.getAttribute("data-testid")?.replace("context-row-", ""));
const lastSave = () => mutate.mock.calls.at(-1)?.[0];
const handle = (path: string) => screen.getByRole("button", { name: new RegExp(`^Reorder ${path.replace(/\./g, "\\.")} `) });

describe("ContextTab", () => {
  it("rows show checkbox, name, folder, source badge and Preview; only attached rows have a handle (SPEC-04 AC-1, AC-4)", () => {
    attached = [ok("docs/a.md", 0)];
    renderTab();
    const row = screen.getByTestId("context-row-docs/a.md");
    expect(within(row).getByRole("checkbox", { name: "Attach docs/a.md" })).toHaveAttribute("aria-checked", "true");
    expect(within(row).getByText("a.md")).toBeInTheDocument();
    // "docs" twice: the folder (muted) and the source badge (green)
    const docsTexts = within(row).getAllByText("docs");
    expect(docsTexts).toHaveLength(2);
    expect(docsTexts.map((el) => el.style.color)).toEqual(["var(--text-muted)", "var(--ok)"]);
    expect(within(row).getByRole("button", { name: "Preview docs/a.md" })).toHaveTextContent("Preview");
    expect(within(row).getByRole("button", { name: /^Reorder docs\/a\.md/ })).toBeInTheDocument();

    const other = screen.getByTestId("context-row-docs/b.md");
    expect(within(other).getByRole("checkbox", { name: "Attach docs/b.md" })).toHaveAttribute("aria-checked", "false");
    expect(within(other).queryByRole("button", { name: /^Reorder/ })).toBeNull();

    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.queryByRole("button", { name: /Move .* (up|down)/ })).toBeNull();
    expect(row).not.toHaveAttribute("draggable");
  });

  it("the checkbox saves the new ordered list; attached docs render first in order (AC-4)", () => {
    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1)];
    renderTab();
    expect(rowPaths()).toEqual(["docs/b.md", "docs/a.md", "README.md", "server/specs/auth.md", "specs/huge.md"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach README.md" }));
    expect(lastSave()).toEqual(["docs/b.md", "docs/a.md", "README.md"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/b.md" }));
    expect(lastSave()).toEqual(["docs/a.md"]);
  });

  it("header shows the title, 'N of M attached', the filter and the order hint (SPEC-04 AC-2)", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    renderTab();
    expect(screen.getByRole("heading", { level: 2, name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5 attached")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter documents…" })).toBeInTheDocument();
    expect(screen.getByText(/Order matters — earlier docs appear earlier in the/)).toHaveTextContent("## Project context");
  });

  it("footer: over the cap the token count is crit with an 'over 4K soft cap' badge and the note (SPEC-04 AC-3)", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    renderTab();
    expect(screen.getByText("≈ 4,500 tokens")).toHaveStyle({ color: "var(--crit)" });
    expect(screen.getByText("over 4K soft cap")).toBeInTheDocument();
    expect(screen.getByText(/Injected as an untrusted block/)).toHaveTextContent(
      "Injected as an untrusted block (## Project context) into every run.",
    );
  });

  it("footer: under the cap there is no badge and the count is not crit (SPEC-04 AC-3)", () => {
    attached = [ok("docs/b.md", 0)];
    renderTab();
    expect(screen.getByText("≈ 1,500 tokens")).toHaveStyle({ color: "var(--text-secondary)" });
    expect(screen.queryByText("over 4K soft cap")).toBeNull();
  });

  it("Arrow Up on a handle saves the moved order and announces it; nothing is saved at the top (SPEC-04 AC-4)", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    const { rerender } = renderTab();
    fireEvent.keyDown(handle("docs/b.md"), { key: "ArrowUp" });
    expect(lastSave()).toEqual(["docs/b.md", "docs/a.md"]);
    expect(screen.getByText("docs/b.md moved to position 1 of 2")).toBeInTheDocument();

    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1)];
    rerender(tree());
    mutate.mockReset();
    fireEvent.keyDown(handle("docs/b.md"), { key: "ArrowUp" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("after a keyboard move the moved row's handle keeps focus although its DOM node moved (SPEC-04 AC-4)", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    const { rerender } = renderTab();
    const a = handle("docs/a.md");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(lastSave()).toEqual(["docs/b.md", "docs/a.md"]);

    // the cache now holds the new order → React moves docs/a.md's row node after docs/b.md. A real
    // browser drops focus from a node that is removed and re-inserted; jsdom doesn't, so blur here.
    a.blur();
    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1)];
    rerender(tree());
    expect(rowPaths().slice(0, 2)).toEqual(["docs/b.md", "docs/a.md"]);
    expect(handle("docs/a.md")).toHaveFocus();
    expect(screen.getByText("docs/a.md moved to position 2 of 2")).toBeInTheDocument();
  });

  it("drag from the handle and drop on another attached row saves the moved order (AC-4)", () => {
    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1), ok("README.md", 2)];
    renderTab();
    fireEvent.dragStart(handle("README.md"), { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(screen.getByTestId("context-row-docs/b.md"));
    fireEvent.drop(screen.getByTestId("context-row-docs/b.md"));
    expect(lastSave()).toEqual(["README.md", "docs/b.md", "docs/a.md"]);
  });

  it("attaching a doc over the cap still saves, and an attached too-large doc shows an alert (AC-4 / SPEC-01)", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach specs/huge.md" }));
    expect(lastSave()).toEqual(["specs/huge.md"]);
    cleanup();

    attached = [ok("specs/huge.md", 0)];
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "specs/huge.md is ~5000 tokens — over the 4,000-token cap on its own, so it will be left out of every run.",
    );
  });

  it("a missing attachment shows 'missing' and a Detach that saves without it (SPEC-01)", () => {
    attached = [ok("docs/a.md", 0), { path: "docs/gone.md", position: 1, status: "missing", source: null, tokens: null }];
    renderTab();
    const row = screen.getByTestId("context-row-docs/gone.md");
    expect(within(row).getByText("missing")).toBeInTheDocument();
    expect(within(row).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Detach docs/gone.md" }));
    expect(lastSave()).toEqual(["docs/a.md"]);
  });

  it("Preview opens a drawer with the path, source, used-by, tokens, an Attach toggle and the rendered doc (SPEC-04 AC-5)", () => {
    attached = [ok("docs/a.md", 0)];
    docContent = { ...DOCS[1]!, content: "# Title\n\nRate limits." };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Preview docs/a.md" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("docs/a.md")).toBeInTheDocument();
    expect(within(dialog).getByText("docs")).toHaveStyle({ color: "var(--ok)" });
    expect(within(dialog).getByText("Used by 1 agent")).toBeInTheDocument();
    expect(within(dialog).getByText("~3000 tokens")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    const toggle = within(dialog).getByRole("button", { name: "Attach docs/a.md" });
    expect(toggle).toHaveTextContent("Attached");
    fireEvent.click(toggle);
    expect(lastSave()).toEqual([]);
  });

  it("the filter narrows rows by folder or name and shows 'No documents found' (SPEC-01)", () => {
    renderTab();
    const input = screen.getByRole("textbox", { name: "Filter documents…" });
    fireEvent.change(input, { target: { value: "SPECS" } });
    expect(rowPaths()).toEqual(["server/specs/auth.md", "specs/huge.md"]);
    fireEvent.change(input, { target: { value: "nothing" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No documents found")).toBeInTheDocument();
  });

  it("a degraded index shows a banner with Resync above working rows", () => {
    docsList = { ...READY, state: { status: "index_degraded", reason: "no_data" } };
    renderTab();
    const banner = screen.getAllByRole("status").find((el) => el.textContent?.includes("Code index is degraded"));
    expect(banner).toHaveTextContent("Reason: no_data");
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(resyncStart).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("not cloned → only the blocking notice: no list and no token footer", () => {
    docsList = { repo_id: "r1", state: { status: "not_cloned" }, docs: [] };
    attached = [ok("docs/a.md", 0)];
    renderTab();
    expect(screen.getByText("Docs are read from the local clone. Resync to fetch it.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/tokens$/)).toBeNull();
    expect(screen.queryByText(/Injected as an untrusted block/)).toBeNull();
  });

  it("a ready repo with no docs shows an empty-state message instead of an empty list", () => {
    docsList = { repo_id: "r1", state: { status: "ready" }, docs: [] };
    renderTab();
    expect(screen.getByText("No Markdown docs in this repository at the last synced commit.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("a keyboard move whose new order never lands does not keep pulling focus on later renders", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    const { rerender } = renderTab();
    fireEvent.keyDown(handle("docs/a.md"), { key: "ArrowDown" });
    // the save is not reflected (order unchanged): docs/a.md never reaches position 1
    const filter = screen.getByRole("textbox", { name: "Filter documents…" });
    filter.focus();
    rerender(tree());
    fireEvent.change(filter, { target: { value: "docs" } });
    expect(filter).toHaveFocus();
  });

  it("without an active repo it asks to select one", () => {
    repoId = null;
    renderTab();
    expect(screen.getByText("Select a repository to attach its docs.")).toBeInTheDocument();
  });
});
