import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, SkillListItem } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function skill(id: string, extra: Partial<SkillListItem> = {}): SkillListItem {
  return {
    id,
    name: id,
    description: `${id} desc`,
    type: "rubric",
    source: "manual",
    body: "b",
    enabled: true,
    version: 1,
    used_by: 0,
    pull_rate: null,
    accept_rate: null,
    ...extra,
  };
}

let catalog: SkillListItem[];
let links: AgentSkillLink[];
const posts: unknown[] = [];

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  if (init?.method === "POST" && path === "/agents/ag1/skills") {
    const body = JSON.parse(String(init.body)) as { skill_ids: string[] };
    posts.push(body);
    links = body.skill_ids.map((skill_id, order) => ({ agent_id: "ag1", skill_id, order }));
    return json(links);
  }
  if (path === "/skills") return json(catalog);
  if (path === "/agents/ag1/skills") return json(links);
  return json({ error: { message: "not found" } }, 404);
});

beforeEach(() => {
  catalog = [skill("pr-rubric"), skill("no-chains", { type: "convention" }), skill("secret-gate", { type: "security" })];
  links = [
    { agent_id: "ag1", skill_id: "secret-gate", order: 0 },
    { agent_id: "ag1", skill_id: "pr-rubric", order: 1 },
  ];
  posts.length = 0;
  push.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <SkillsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: "Save skills" });
const rowIds = () => screen.getAllByTestId(/^skill-row-/).map((el) => el.dataset.testid!.replace("skill-row-", ""));

describe("SkillsTab", () => {
  it("shows the linked count, linked skills first in link order, and type tags", async () => {
    renderTab();
    expect(await screen.findByText("2 of 3 enabled")).toBeInTheDocument();
    expect(rowIds()).toEqual(["secret-gate", "pr-rubric", "no-chains"]);
    expect(screen.getByRole("checkbox", { name: "secret-gate" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "no-chains" })).toHaveAttribute("aria-checked", "false");
    expect(within(screen.getByTestId("skill-row-secret-gate")).getByText("security")).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
  });

  it("toggling a checkbox updates the count and enables Save; nothing is posted yet", async () => {
    renderTab();
    await screen.findByText("2 of 3 enabled");
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "no-chains" }));
    expect(screen.getByText("3 of 3 enabled")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(posts).toEqual([]);
    // Reverting to the saved selection makes the tab pristine again.
    fireEvent.click(screen.getByRole("checkbox", { name: "no-chains" }));
    expect(saveButton()).toBeDisabled();
  });

  it("Save posts the linked ids in list order and then goes pristine", async () => {
    renderTab();
    await screen.findByText("2 of 3 enabled");
    fireEvent.click(screen.getByRole("checkbox", { name: "pr-rubric" })); // unlink
    fireEvent.click(screen.getByRole("checkbox", { name: "no-chains" })); // link
    fireEvent.click(saveButton());
    await waitFor(() => expect(posts).toEqual([{ skill_ids: ["secret-gate", "no-chains"] }]));
    expect(await screen.findByText("Skills saved (2 linked)")).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("filters rows by name/description and disables dragging while filtering", async () => {
    renderTab();
    await screen.findByText("2 of 3 enabled");
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "CHAINS" } });
    expect(rowIds()).toEqual(["no-chains"]);
    expect(screen.getByRole("button", { name: "Drag to reorder no-chains" })).toHaveAttribute("title", "Clear the filter to reorder");
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "zzz" } });
    expect(screen.getByText('No skills match "zzz".')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "" } });
    expect(rowIds()).toHaveLength(3);
  });

  it("renders a drag handle per row that is keyboard-focusable", async () => {
    renderTab();
    await screen.findByText("2 of 3 enabled");
    const handle = screen.getByRole("button", { name: "Drag to reorder pr-rubric" });
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
  });

  it("dims globally disabled skills with an explanatory note but still allows linking", async () => {
    catalog = [skill("pr-rubric"), skill("off-skill", { enabled: false })];
    links = [];
    renderTab();
    await screen.findByText("0 of 2 enabled");
    const row = screen.getByTestId("skill-row-off-skill");
    expect(within(row).getByText("disabled")).toBeInTheDocument();
    expect(row).toHaveAttribute("title", expect.stringContaining("skipped at run time"));
    fireEvent.click(screen.getByRole("checkbox", { name: "off-skill" }));
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("shows an empty state linking to /skills when the catalog is empty", async () => {
    catalog = [];
    links = [];
    renderTab();
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to Skills" }));
    expect(push).toHaveBeenCalledWith("/skills");
  });

  it("shows an error state when loading fails", async () => {
    fetchMock.mockImplementationOnce(() => json({ error: { message: "down" } }, 500));
    renderTab();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load skills");
  });
});
