import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { AgentSuggestion } from "@devdigest/shared";
import { fetchCalls, mockFetch, renderWithProviders } from "../test-utils";
import { AgentSuggestionsDialog } from "./AgentSuggestionsDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUGGEST = "GET /skills/sk1/agent-suggestions";
const API: AgentSuggestion = {
  agent_id: "a1",
  agent_name: "API Contract Reviewer",
  score: 0.7,
  preselected: true,
  reasons: [
    { kind: "category", categories: ["api", "errors"] },
    { kind: "keywords", keywords: ["api", "schema"] },
  ],
};
const SEC: AgentSuggestion = {
  agent_id: "a2",
  agent_name: "Security Reviewer",
  score: 0.55,
  preselected: true,
  reasons: [{ kind: "type", type: "convention", count: 2 }],
};
const PERF: AgentSuggestion = {
  agent_id: "a3",
  agent_name: "Performance Reviewer",
  score: 0.1,
  preselected: false,
  reasons: [{ kind: "keywords", keywords: ["query"] }],
};

function open(enabled = false) {
  const onClose = vi.fn();
  renderWithProviders(<AgentSuggestionsDialog skill={{ id: "sk1", enabled }} onClose={onClose} />);
  return onClose;
}

const row = (name: string) => screen.getByRole("listitem", { name });
const choice = (name: string, option: "Accept" | "Reject") =>
  within(within(row(name)).getByRole("radiogroup")).getByRole("radio", { name: option });
const posts = (spy: ReturnType<typeof mockFetch>) =>
  fetchCalls(spy).filter(([m]) => m === "POST").map(([, path, body]) => [path, body]);

describe("AgentSuggestionsDialog", () => {
  it("lists agents with readable reasons; high scores start on Accept; notes a disabled skill", async () => {
    mockFetch({ [SUGGEST]: [API, SEC, PERF] });
    open(false);

    expect(await screen.findByRole("dialog")).toHaveTextContent("Link this skill to agents");
    expect(screen.getByText(/Skill is disabled — enable it on Config/)).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("matches API, error handling")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("shared words: api, schema")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("fit 70%")).toBeInTheDocument();
    expect(within(row("Security Reviewer")).getByText("already uses 2 convention skills")).toBeInTheDocument();

    expect(choice("API Contract Reviewer", "Accept")).toHaveAttribute("aria-checked", "true");
    expect(choice("Security Reviewer", "Accept")).toHaveAttribute("aria-checked", "true");
    expect(choice("Performance Reviewer", "Reject")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Link to 2 agents" })).toBeEnabled();
  });

  it("writes nothing until confirm, then links only the accepted agents and closes", async () => {
    const spy = mockFetch({
      [SUGGEST]: [API, SEC, PERF],
      "POST /agents/a1/skills": [{ agent_id: "a1", skill_id: "sk1", order: 0 }],
      "POST /agents/a3/skills": [{ agent_id: "a3", skill_id: "sk1", order: 1 }],
    });
    const onClose = open(true);
    await screen.findByRole("dialog");
    expect(screen.queryByText(/Skill is disabled/)).not.toBeInTheDocument();

    fireEvent.click(choice("Security Reviewer", "Reject"));
    fireEvent.click(choice("Performance Reviewer", "Accept"));
    expect(posts(spy)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Link to 2 agents" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts(spy)).toEqual([
      ["/agents/a1/skills", { skill_id: "sk1" }],
      ["/agents/a3/skills", { skill_id: "sk1" }],
    ]);
    expect(await screen.findByText("Linked to 2 agents")).toBeInTheDocument();
  });

  it("a failed link keeps the dialog: linked rows lock, Retry failed re-sends only the failed agent", async () => {
    let secFails = true;
    let linkedA1 = false;
    const spy = mockFetch({
      // Like the server: an agent that has the skill is no longer suggested.
      [SUGGEST]: () => ({ body: linkedA1 ? [SEC] : [API, SEC] }),
      "POST /agents/a1/skills": () => {
        linkedA1 = true;
        return { body: [] };
      },
      "POST /agents/a2/skills": () =>
        secFails ? { status: 500, body: { error: { code: "boom", message: "down" } } } : { body: [] },
    });
    const onClose = open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Link to 2 agents" }));

    expect(await within(row("API Contract Reviewer")).findByText("Linked")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(within(row("Security Reviewer")).getByText("Could not link")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    secFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry failed (1)" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts(spy).map(([path]) => path)).toEqual(["/agents/a1/skills", "/agents/a2/skills", "/agents/a2/skills"]);
    expect(await screen.findByText("Linked to 2 agents")).toBeInTheDocument();
  });

  it("Skip closes without writing", async () => {
    const spy = mockFetch({ [SUGGEST]: [API] });
    const onClose = open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    expect(onClose).toHaveBeenCalled();
    expect(posts(spy)).toEqual([]);
  });

  it("no agent fits → renders nothing and closes itself once (suggest leaves the URL)", async () => {
    mockFetch({ [SUGGEST]: [] });
    const onClose = open(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a failed suggestions request → renders nothing and closes itself once", async () => {
    mockFetch({ [SUGGEST]: () => ({ status: 500, body: { error: { code: "boom", message: "down" } } }) });
    const onClose = open(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("X and the backdrop close it without writing", async () => {
    const spy = mockFetch({ [SUGGEST]: [API] });
    const onClose = open(true);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(posts(spy)).toEqual([]);
  });

  it("while links are in flight nothing closes it and the choices are locked; after success it cannot link twice", async () => {
    const spy = mockFetch({ [SUGGEST]: [API], "POST /agents/a1/skills": [] });
    // Hold the POST until the test releases it.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") await gate;
      return spy(url, init);
    });
    const onClose = open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Link to 1 agent" }));

    expect(await screen.findByRole("button", { name: "Linking…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    expect(choice("API Contract Reviewer", "Reject")).toBeDisabled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(onClose).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // The parent has not unmounted it yet (router.replace is async): the row is locked, nothing left to link.
    expect(within(row("API Contract Reviewer")).getByText("Linked")).toBeInTheDocument();
    const again = screen.getByRole("button", { name: "Nothing to link" });
    expect(again).toBeDisabled();
    fireEvent.click(again);
    expect(posts(spy)).toEqual([["/agents/a1/skills", { skill_id: "sk1" }]]);
  });
});
