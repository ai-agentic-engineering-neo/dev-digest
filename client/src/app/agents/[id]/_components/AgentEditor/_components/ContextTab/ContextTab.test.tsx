import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { AgentContextDoc, ContextDocContent, ContextDocList } from "@/lib/types";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

/* Agent editor · Context tab — hooks and repo context are mocked; saves are asserted on the mutation. */

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

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
      <ToastProvider>
        <ContextTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const rowPaths = () => screen.getAllByRole("listitem").map((r) => r.getAttribute("data-testid")?.replace("context-row-", ""));
const lastSave = () => mutate.mock.calls.at(-1)?.[0];

describe("ContextTab", () => {
  it("attaching a doc saves the new ordered list; attached docs render first in order (AC-6)", () => {
    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1)];
    renderTab();
    expect(rowPaths()).toEqual(["docs/b.md", "docs/a.md", "README.md", "server/specs/auth.md", "specs/huge.md"]);
    expect(screen.getByText("#1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Attach README.md" }));
    expect(lastSave()).toEqual(["docs/b.md", "docs/a.md", "README.md"]);

    fireEvent.click(screen.getByRole("switch", { name: "Attach docs/b.md" }));
    expect(lastSave()).toEqual(["docs/a.md"]);
  });

  it("↑/↓ and drag-and-drop save the moved order (AC-6)", () => {
    attached = [ok("docs/b.md", 0), ok("docs/a.md", 1), ok("README.md", 2)];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move docs/a.md up" }));
    expect(lastSave()).toEqual(["docs/a.md", "docs/b.md", "README.md"]);
    // the mocked list does not change after a save: each move starts from [b, a, README]
    fireEvent.click(screen.getByRole("button", { name: "Move docs/b.md down" }));
    expect(lastSave()).toEqual(["docs/a.md", "docs/b.md", "README.md"]);
    expect(screen.getByRole("button", { name: "Move docs/b.md up" })).toBeDisabled();
    expect(screen.getByRole("img", { name: "Drag to reorder README.md" })).toBeInTheDocument();

    fireEvent.dragStart(screen.getByTestId("context-row-README.md"), { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(screen.getByTestId("context-row-docs/b.md"));
    fireEvent.drop(screen.getByTestId("context-row-docs/b.md"));
    expect(lastSave()).toEqual(["README.md", "docs/b.md", "docs/a.md"]);
  });

  it("shows 'N of M attached', the token sum and the over-cap badge (AC-7)", () => {
    attached = [ok("docs/a.md", 0), ok("docs/b.md", 1)];
    renderTab();
    expect(screen.getByText("2 of 5 attached")).toBeInTheDocument();
    expect(screen.getByText("~4500 tokens per model call")).toBeInTheDocument();
    expect(screen.getByText("Over the 4,000-token cap — later docs will be left out of runs")).toBeInTheDocument();
  });

  it("no over-cap badge under the cap", () => {
    attached = [ok("docs/b.md", 0)];
    renderTab();
    expect(screen.getByText("~1500 tokens per model call")).toBeInTheDocument();
    expect(screen.queryByText(/Over the 4,000-token cap/)).not.toBeInTheDocument();
  });

  it("attaching a doc over the cap still saves, and an attached too-large doc shows an alert (AC-7)", () => {
    renderTab();
    fireEvent.click(screen.getByRole("switch", { name: "Attach specs/huge.md" }));
    expect(lastSave()).toEqual(["specs/huge.md"]);
    cleanup();

    attached = [ok("specs/huge.md", 0)];
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "specs/huge.md is ~5000 tokens — over the 4,000-token cap on its own, so it will be left out of every run.",
    );
  });

  it("a missing attachment shows 'missing' and a Detach that saves without it (AC-10)", () => {
    attached = [ok("docs/a.md", 0), { path: "docs/gone.md", position: 1, status: "missing", source: null, tokens: null }];
    renderTab();
    const row = screen.getByTestId("context-row-docs/gone.md");
    expect(within(row).getByText("missing")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Detach docs/gone.md" }));
    expect(lastSave()).toEqual(["docs/a.md"]);
  });

  it("Preview opens a dialog with the rendered doc, its meta and an Attach toggle that saves (AC-2)", () => {
    docContent = { ...DOCS[3]!, content: "# Auth rules\n\nAll routes need a session." };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Preview server/specs/auth.md" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Auth rules" })).toBeInTheDocument();
    expect(within(dialog).getByText("~300 tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("no agents")).toBeInTheDocument();
    const toggle = within(dialog).getByRole("button", { name: "Attach server/specs/auth.md" });
    expect(toggle).toHaveTextContent("Attach");
    fireEvent.click(toggle);
    expect(lastSave()).toEqual(["server/specs/auth.md"]);
  });

  it("the filter narrows rows by folder or name and shows 'No documents found' (AC-3)", () => {
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

  it("without an active repo it asks to select one", () => {
    repoId = null;
    renderTab();
    expect(screen.getByText("Select a repository to attach its docs.")).toBeInTheDocument();
  });
});
