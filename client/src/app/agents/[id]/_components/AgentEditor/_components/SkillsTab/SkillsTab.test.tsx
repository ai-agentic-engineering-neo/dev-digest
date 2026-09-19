import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillDetail } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "Flags uncovered branches and corner cases",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a test-quality reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const SKILLS: AgentSkillDetail[] = [
  {
    id: "sk1",
    name: "test-coverage-nudge",
    description: "Every new branch needs an assertion that fails without it",
    type: "custom",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    token_estimate: 40,
    order: 0,
    link_enabled: true,
  },
  {
    id: "sk2",
    name: "corner-case-checklist",
    description: "Empty · null · boundary · concurrency · error path",
    type: "rubric",
    source: "manual",
    body: "…",
    enabled: true,
    version: 1,
    token_estimate: 55,
    order: 1,
    link_enabled: false,
  },
];

interface Call {
  method: string;
  body: unknown;
}

/** Stubs `fetch` for the module's API base and records every call's method + body. */
function mockFetch(list: AgentSkillDetail[]): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, body });
    return {
      ok: true,
      status: 200,
      json: async () => list,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <SkillsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("renders the {enabled} of {total} enabled count chip", async () => {
    mockFetch(SKILLS);
    renderTab();
    expect(await screen.findByText("test-coverage-nudge")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("checkbox toggle POSTs the full ordered array with the flipped per-link flag", async () => {
    const calls = mockFetch(SKILLS);
    renderTab();
    await screen.findByText("corner-case-checklist");

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!); // corner-case-checklist: off -> on

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({
      skills: [
        { skill_id: "sk1", enabled: true },
        { skill_id: "sk2", enabled: true },
      ],
    });
  });

  it("does not toggle a skill whose global enabled flag is off", async () => {
    const calls = mockFetch([{ ...SKILLS[1]!, enabled: false }, SKILLS[0]!]);
    renderTab();
    await screen.findByText("corner-case-checklist");

    fireEvent.click(screen.getAllByRole("checkbox")[0]!); // the globally-disabled skill
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("↑/↓ reorder issues one ordered POST", async () => {
    const calls = mockFetch(SKILLS);
    renderTab();
    await screen.findByText("test-coverage-nudge");

    fireEvent.click(screen.getAllByLabelText("Move down")[0]!); // sk1 (index 0) -> index 1

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({
      skills: [
        { skill_id: "sk2", enabled: false },
        { skill_id: "sk1", enabled: true },
      ],
    });
  });
});
