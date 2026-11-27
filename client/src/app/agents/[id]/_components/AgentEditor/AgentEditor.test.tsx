import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  mutate.mockClear();
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
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("saves only the changed fields, not an enabled toggled elsewhere", () => {
    const view = renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    // The list toggles `enabled` off: same id, new agent prop.
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <AgentEditor agent={{ ...AGENT, enabled: false, version: 2 }} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText("Save agent"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toEqual({ id: "ag1", patch: { name: "Renamed" } });
  });

  it("disables Save until something changes", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const save = screen.getByText("Save agent").closest("button")!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "X" } });
    expect(save).toBeEnabled();
  });

  it("resets the draft when switching agents", () => {
    const view = renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Unsaved" } });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <AgentEditor agent={{ ...AGENT, id: "ag2", name: "Other" }} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByDisplayValue("Other")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsaved")).not.toBeInTheDocument();
  });
});
