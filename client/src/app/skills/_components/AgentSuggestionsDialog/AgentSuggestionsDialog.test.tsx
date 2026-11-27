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
const button = (name: string, label: "Accept" | "Reject" | "Linking…") =>
  within(row(name)).getByRole("button", { name: label });
const posts = (spy: ReturnType<typeof mockFetch>) =>
  fetchCalls(spy).filter(([m]) => m === "POST").map(([, path, body]) => [path, body]);

describe("AgentSuggestionsDialog", () => {
  it("lists agents with readable reasons, a Recommended badge for high scores, and a note for a disabled skill", async () => {
    mockFetch({ [SUGGEST]: [API, SEC, PERF] });
    open(false);

    expect(await screen.findByRole("dialog")).toHaveTextContent("Link this skill to agents");
    expect(screen.getByText(/Skill is disabled — enable it on Config/)).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("matches API, error handling")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("shared words: api, schema")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("fit 70%")).toBeInTheDocument();
    expect(within(row("Security Reviewer")).getByText("already uses 2 convention skills")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).getByText("Recommended")).toBeInTheDocument();
    expect(within(row("Performance Reviewer")).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("Reject removes the agent from the list and writes nothing", async () => {
    const spy = mockFetch({ [SUGGEST]: [API, SEC] });
    const onClose = open(true);
    await screen.findByRole("dialog");

    fireEvent.click(button("Security Reviewer", "Reject"));
    expect(screen.queryByRole("listitem", { name: "Security Reviewer" })).not.toBeInTheDocument();
    expect(row("API Contract Reviewer")).toBeInTheDocument();
    expect(posts(spy)).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Accept links that agent at once and marks the row Linked; the last decision closes the dialog with a toast", async () => {
    const spy = mockFetch({
      [SUGGEST]: [API, SEC, PERF],
      "POST /agents/a1/skills": [{ agent_id: "a1", skill_id: "sk1", order: 0 }],
      "POST /agents/a3/skills": [{ agent_id: "a3", skill_id: "sk1", order: 1 }],
    });
    const onClose = open(true);
    await screen.findByRole("dialog");

    fireEvent.click(button("API Contract Reviewer", "Accept"));
    expect(await within(row("API Contract Reviewer")).findByText("Linked")).toBeInTheDocument();
    expect(within(row("API Contract Reviewer")).queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(posts(spy)).toEqual([["/agents/a1/skills", { skill_id: "sk1" }]]);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(button("Security Reviewer", "Reject"));
    fireEvent.click(button("Performance Reviewer", "Accept"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(posts(spy)).toEqual([
      ["/agents/a1/skills", { skill_id: "sk1" }],
      ["/agents/a3/skills", { skill_id: "sk1" }],
    ]);
    expect(await screen.findByText("Linked to 2 agents")).toBeInTheDocument();
  });

  it("rejecting every agent closes the dialog without a toast", async () => {
    const spy = mockFetch({ [SUGGEST]: [API, SEC] });
    const onClose = open(true);
    await screen.findByRole("dialog");
    fireEvent.click(button("API Contract Reviewer", "Reject"));
    fireEvent.click(button("Security Reviewer", "Reject"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument();
    expect(posts(spy)).toEqual([]);
  });

  it("a failed link keeps the row with 'Could not link'; Accept again retries only that agent", async () => {
    let fails = true;
    const spy = mockFetch({
      [SUGGEST]: [API, SEC],
      "POST /agents/a2/skills": () =>
        fails ? { status: 500, body: { error: { code: "boom", message: "down" } } } : { body: [] },
    });
    const onClose = open(true);
    await screen.findByRole("dialog");

    fireEvent.click(button("Security Reviewer", "Accept"));
    expect(await within(row("Security Reviewer")).findByText("Could not link")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fails = false;
    fireEvent.click(button("Security Reviewer", "Accept"));
    expect(await within(row("Security Reviewer")).findByText("Linked")).toBeInTheDocument();
    expect(posts(spy).map(([path]) => path)).toEqual(["/agents/a2/skills", "/agents/a2/skills"]);
  });

  it("Done closes it; a toast says how many were linked", async () => {
    mockFetch({ [SUGGEST]: [API, SEC], "POST /agents/a1/skills": [] });
    const onClose = open(true);
    await screen.findByRole("dialog");
    fireEvent.click(button("API Contract Reviewer", "Accept"));
    await within(row("API Contract Reviewer")).findByText("Linked");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Linked to 1 agent")).toBeInTheDocument();
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

  it("X and the backdrop close it without writing (once)", async () => {
    const spy = mockFetch({ [SUGGEST]: [API] });
    const onClose = open(true);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(posts(spy)).toEqual([]);
  });

  it("while a link is in flight the row is locked and nothing closes the dialog; a second Accept sends nothing", async () => {
    const spy = mockFetch({ [SUGGEST]: [API, SEC], "POST /agents/a1/skills": [] });
    // Hold the POST until the test releases it.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") await gate;
      return spy(url, init);
    });
    const onClose = open(true);
    await screen.findByRole("dialog");
    fireEvent.click(button("API Contract Reviewer", "Accept"));

    expect(await within(row("API Contract Reviewer")).findByRole("button", { name: "Linking…" })).toBeDisabled();
    expect(button("API Contract Reviewer", "Reject")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("dialog").previousElementSibling!);
    expect(onClose).not.toHaveBeenCalled();

    release();
    expect(await within(row("API Contract Reviewer")).findByText("Linked")).toBeInTheDocument();
    expect(posts(spy)).toEqual([["/agents/a1/skills", { skill_id: "sk1" }]]);
  });
});
