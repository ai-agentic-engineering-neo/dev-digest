import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "../../AgentEditor";
import { formFromAgent, formToPatch } from "./helpers";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  skill_count: 0,
  enabled: true,
  version: 1,
};
const OTHER: Agent = { ...AGENT, id: "ag2", name: "Style Reviewer", system_prompt: "Style." };

function editor(agent: Agent) {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <AgentEditor agent={agent} tab="config" onTab={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe("ConfigTab helpers", () => {
  it("round-trips agent fields into the update patch (snake_case)", () => {
    expect(formToPatch(formFromAgent(AGENT))).toEqual({
      name: "Security Reviewer",
      description: "Flags secrets and injection",
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a security reviewer.",
      strategy: "single-pass",
      ci_fail_on: "critical",
      repo_intel: true,
      enabled: true,
    });
  });
});

describe("ConfigTab", () => {
  it("saves the edited form as the agent patch", () => {
    render(editor(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Sec v2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save agent/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      id: "ag1",
      patch: expect.objectContaining({ name: "Sec v2", system_prompt: "You are a security reviewer." }),
    });
  });

  it("resets the form when switching to another agent", () => {
    const { rerender } = render(editor(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "unsaved edit" } });
    rerender(editor(OTHER));
    expect(screen.getByDisplayValue("Style Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("unsaved edit")).not.toBeInTheDocument();
  });

  it("keeps in-progress edits when the same agent is refetched", () => {
    const { rerender } = render(editor(AGENT));
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "unsaved edit" } });
    rerender(editor({ ...AGENT, version: 2 }));
    expect(screen.getByDisplayValue("unsaved edit")).toBeInTheDocument();
  });
});
