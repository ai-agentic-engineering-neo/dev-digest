import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

// Mock the API boundary; the real hooks (optimistic update + rollback) run.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, ApiError: class extends Error {} }));

import { SkillsTab } from "./SkillsTab";

const skill = (id: string, name: string, patch: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "custom",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  agent_count: 0,
  ...patch,
});

const SKILLS = [
  skill("a", "alpha-rule", { type: "rubric" }),
  skill("b", "beta-rule", { type: "security" }),
  skill("c", "gamma-rule", { enabled: false }),
];

let serverSkills: Skill[];
let serverLinks: AgentSkillLink[];
const toLinks = (ids: string[]) => ids.map((skill_id, order) => ({ agent_id: "ag1", skill_id, order }));

beforeEach(() => {
  serverSkills = SKILLS;
  serverLinks = [];
  api.get.mockImplementation(async (path: string) => (path === "/skills" ? serverSkills : serverLinks));
  api.post.mockImplementation(async (_path: string, body: { skill_ids: string[] }) => {
    serverLinks = toLinks(body.skill_ids);
    return serverLinks;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <SkillsTab agentId="ag1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowNames = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
const row = (name: string) => screen.getByRole("listitem", { name });
const checkbox = (name: string) => screen.getByRole("checkbox", { name });
const lastSaved = () => api.post.mock.lastCall?.[1];

describe("Agent Editor → Skills tab", () => {
  it("lists attached skills first, attaches to the end and detaches, saving each change", async () => {
    serverLinks = toLinks(["b"]);
    renderTab();

    expect(await screen.findByText("1 of 3 enabled")).toBeInTheDocument();
    expect(rowNames()).toEqual(["beta-rule", "alpha-rule", "gamma-rule"]);
    expect(checkbox("beta-rule")).toHaveAttribute("aria-checked", "true");
    // globally disabled skill keeps its badge; type badges render their labels
    expect(within(row("gamma-rule")).getByText("disabled")).toBeInTheDocument();
    expect(within(row("beta-rule")).queryByText("disabled")).not.toBeInTheDocument();
    expect(within(row("beta-rule")).getByText("Security")).toBeInTheDocument();

    fireEvent.click(checkbox("gamma-rule"));
    await waitFor(() => expect(lastSaved()).toEqual({ skill_ids: ["b", "c"] }));
    await waitFor(() => expect(rowNames()).toEqual(["beta-rule", "gamma-rule", "alpha-rule"]));
    expect(await screen.findByText("2 of 3 enabled")).toBeInTheDocument();

    fireEvent.click(checkbox("beta-rule"));
    await waitFor(() => expect(lastSaved()).toEqual({ skill_ids: ["c"] }));
    await waitFor(() => expect(rowNames()).toEqual(["gamma-rule", "alpha-rule", "beta-rule"]));
    expect(api.post).toHaveBeenCalledWith("/agents/ag1/skills", { skill_ids: ["c"] });
  });

  it("reorders attached rows with Alt+↑/↓ and by drag and drop", async () => {
    serverLinks = toLinks(["a", "b", "c"]);
    renderTab();
    await screen.findByText("3 of 3 enabled");

    // plain arrows and moving past the top do nothing
    fireEvent.keyDown(row("alpha-rule"), { key: "ArrowDown" });
    fireEvent.keyDown(row("alpha-rule"), { key: "ArrowUp", altKey: true });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.keyDown(row("alpha-rule"), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(lastSaved()).toEqual({ skill_ids: ["b", "a", "c"] }));
    await waitFor(() => expect(rowNames()).toEqual(["beta-rule", "alpha-rule", "gamma-rule"]));
    expect(screen.getByRole("status")).toHaveTextContent("alpha-rule moved to position 2 of 3");

    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(row("gamma-rule"), { dataTransfer });
    fireEvent.dragOver(row("beta-rule"), { dataTransfer });
    fireEvent.drop(row("beta-rule"), { dataTransfer });
    await waitFor(() => expect(lastSaved()).toEqual({ skill_ids: ["c", "b", "a"] }));
    await waitFor(() => expect(rowNames()).toEqual(["gamma-rule", "beta-rule", "alpha-rule"]));
  });

  it("disables drag and keyboard reorder while the filter is non-empty", async () => {
    serverLinks = toLinks(["a", "b"]);
    renderTab();
    await screen.findByText("2 of 3 enabled");
    expect(row("alpha-rule")).toHaveAttribute("draggable", "true");
    // unattached rows are never draggable
    expect(row("gamma-rule")).toHaveAttribute("draggable", "false");

    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills" }), { target: { value: "RULE" } });
    expect(row("alpha-rule")).toHaveAttribute("draggable", "false");
    expect(screen.getByText(/Clear the filter to reorder/)).toBeInTheDocument();
    fireEvent.keyDown(row("alpha-rule"), { key: "ArrowDown", altKey: true });
    fireEvent.dragStart(row("alpha-rule"), { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(row("beta-rule"));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Filter skills" }), { target: { value: "gamma" } });
    expect(rowNames()).toEqual(["gamma-rule"]);
  });

  it("rolls back the optimistic attach when saving fails", async () => {
    let fail!: (e: Error) => void;
    api.post.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    renderTab();
    await screen.findByText("0 of 3 enabled");
    // refetches never settle, so only the hook's rollback can undo the optimistic state
    api.get.mockImplementation(() => new Promise(() => {}));

    fireEvent.click(checkbox("alpha-rule"));
    await waitFor(() => expect(checkbox("alpha-rule")).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    fail(new Error("boom"));
    await waitFor(() => expect(checkbox("alpha-rule")).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("0 of 3 enabled")).toBeInTheDocument();
  });

  it("shows an empty state linking to /skills when the workspace has no skills", async () => {
    serverSkills = [];
    renderTab();
    expect(await screen.findByText("No skills in this workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Skills" })).toHaveAttribute("href", "/skills");
  });
});
