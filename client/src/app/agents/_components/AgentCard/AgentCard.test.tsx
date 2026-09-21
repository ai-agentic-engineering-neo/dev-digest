import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";

const del = { mutate: vi.fn(), isPending: false };
vi.mock("@/lib/hooks/agents", () => ({ useDeleteAgent: () => del }));

import { AgentCard } from "./AgentCard";
import { acceptColor, formatAcceptRate, formatAvgCost } from "./helpers";

afterEach(() => {
  cleanup();
  del.mutate.mockReset();
});

const AGENT: AgentListItem = {
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
  skill_count: 3,
  runs: 36,
  accept_rate: 14,
  avg_cost_usd: 0.0072,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const stats = () => screen.getByTestId("agent-card-stats");

describe("AgentCard", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderCard(<AgentCard ag={AGENT} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("uses the singular for exactly one skill", () => {
    renderCard(<AgentCard ag={{ ...AGENT, skill_count: 1 }} />);
    expect(screen.getByText("1 skill")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderCard(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows the runs · accept · avg cost stats line", () => {
    renderCard(<AgentCard ag={AGENT} />);
    expect(stats()).toHaveTextContent("36 runs · 14% accept · $0.007 avg");
  });

  it("colours the accept rate by threshold: <30 crit, <60 warn, else ok", () => {
    const { rerender } = renderCard(<AgentCard ag={{ ...AGENT, accept_rate: 14 }} />);
    const accept = () => within(stats()).getByText(/accept/);
    expect(accept().getAttribute("style")).toContain("var(--crit)");
    for (const [rate, token] of [
      [50, "var(--warn)"],
      [80, "var(--ok)"],
    ] as const) {
      rerender(
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <AgentCard ag={{ ...AGENT, accept_rate: rate }} />
        </NextIntlClientProvider>,
      );
      expect(accept().getAttribute("style")).toContain(token);
    }
  });

  it("shows '0 runs · 0% accept' (no cost) for an agent that never ran", () => {
    renderCard(<AgentCard ag={{ ...AGENT, runs: 0, accept_rate: null, avg_cost_usd: null }} />);
    expect(stats()).toHaveTextContent("0 runs · 0% accept");
    expect(stats()).not.toHaveTextContent("avg");
  });

  it("shows nothing-accepted-yet as a red 0% and an unknown cost as an em dash once runs exist", () => {
    renderCard(<AgentCard ag={{ ...AGENT, runs: 1, accept_rate: null, avg_cost_usd: null }} />);
    expect(stats()).toHaveTextContent("1 run · 0% accept · — avg");
    expect(within(stats()).getByText(/accept/).getAttribute("style")).toContain("var(--crit)");
  });

  it("colours the 0% of a never-run agent red too", () => {
    renderCard(<AgentCard ag={{ ...AGENT, runs: 0, accept_rate: null, avg_cost_usd: null }} />);
    expect(within(stats()).getByText(/accept/).getAttribute("style")).toContain("var(--crit)");
  });

  describe("delete confirmation", () => {
    it("opens a modal (no window.confirm) and deletes only after confirming", () => {
      const nativeConfirm = vi.spyOn(window, "confirm");
      const onClick = vi.fn();
      renderCard(<AgentCard ag={AGENT} onClick={onClick} />);

      fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Delete agent “Security Reviewer”?")).toBeInTheDocument();
      expect(within(dialog).getByText(/past runs stay in the timeline/)).toBeInTheDocument();
      expect(del.mutate).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled(); // opening the dialog must not open the agent
      expect(nativeConfirm).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(del.mutate).toHaveBeenCalledTimes(1);
      expect(del.mutate.mock.calls[0]![0]).toBe("ag1");
      nativeConfirm.mockRestore();
    });

    it("calls onDeleted only once the delete succeeded", () => {
      const onDeleted = vi.fn();
      renderCard(<AgentCard ag={AGENT} onDeleted={onDeleted} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      expect(onDeleted).not.toHaveBeenCalled();
      const opts = del.mutate.mock.calls[0]![1] as { onSuccess: () => void };
      opts.onSuccess();
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });

    it("Cancel closes the modal without deleting", () => {
      renderCard(<AgentCard ag={AGENT} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(del.mutate).not.toHaveBeenCalled();
    });

    it("the ✕ close button also dismisses without deleting", () => {
      renderCard(<AgentCard ag={AGENT} />);
      fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
      const dialog = screen.getByRole("dialog");
      // Header ✕ is the only button besides Cancel/Delete.
      const close = within(dialog)
        .getAllByRole("button")
        .find((b) => !["Cancel", "Delete"].includes(b.textContent ?? ""));
      expect(close).toBeDefined();
      fireEvent.click(close!);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(del.mutate).not.toHaveBeenCalled();
    });
  });
});

describe("AgentCard helpers", () => {
  it("acceptColor bands + null", () => {
    expect(acceptColor(0)).toBe("var(--crit)");
    expect(acceptColor(29.9)).toBe("var(--crit)");
    expect(acceptColor(30)).toBe("var(--warn)");
    expect(acceptColor(59.9)).toBe("var(--warn)");
    expect(acceptColor(60)).toBe("var(--ok)");
    expect(acceptColor(null)).toBe("var(--text-muted)");
  });

  it("formatAcceptRate rounds to a whole percent, null → —", () => {
    expect(formatAcceptRate(13.6)).toBe("14");
    expect(formatAcceptRate(null)).toBe("—");
  });

  it("formatAvgCost keeps 3 decimals, null → —", () => {
    expect(formatAvgCost(0.0072)).toBe("$0.007");
    expect(formatAvgCost(0.06)).toBe("$0.060");
    expect(formatAvgCost(null)).toBe("—");
  });
});
