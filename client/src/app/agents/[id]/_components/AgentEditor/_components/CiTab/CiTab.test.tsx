import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import * as ciHooks from "@/lib/hooks/ci";
import * as agentHooks from "@/lib/hooks/agents";
import * as toastLib from "@/lib/toast";

/**
 * specs/14-export-to-ci.md AC-33…AC-39 — the agent editor's CI tab: how many
 * repositories the agent is deployed to (AC-39's empty state included), and
 * the three-way merge-gate control (AC-35). `ExportWizard` (the modal, only
 * mounted once "Export to CI" is clicked) is stubbed out — this tab's own
 * behaviour doesn't depend on the wizard's internals, and stubbing it avoids
 * having to also mock every hook the wizard itself calls.
 */

vi.mock("./_components/ExportWizard", () => ({
  ExportWizard: () => <div>export-wizard-stub</div>,
}));

import { CiTab } from "./CiTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Security Reviewer",
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "Review the diff.",
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: "auto",
    ci_fail_on: "critical",
    repo_intel: true,
    ...overrides,
  };
}

function mockInstallations(data: unknown, isLoading = false) {
  vi.spyOn(ciHooks, "useCiInstallations").mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof ciHooks.useCiInstallations>);
}

function mockRepublish(overrides: Partial<ReturnType<typeof ciHooks.useRepublishCi>> = {}) {
  vi.spyOn(ciHooks, "useRepublishCi").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof ciHooks.useRepublishCi>);
}

function mockUpdateAgent(overrides: Partial<ReturnType<typeof agentHooks.useUpdateAgent>> = {}) {
  return vi.spyOn(agentHooks, "useUpdateAgent").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof agentHooks.useUpdateAgent>);
}

function mockToast() {
  vi.spyOn(toastLib, "useToast").mockReturnValue({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    toast: vi.fn(),
  } as unknown as ReturnType<typeof toastLib.useToast>);
}

describe("CiTab", () => {
  it("AC-39 — the empty state renders when the agent has zero CI installations, with a zero-repository count", () => {
    mockInstallations([]);
    mockRepublish();
    mockUpdateAgent();
    mockToast();
    renderWithIntl(<CiTab agent={agent()} />);

    expect(screen.getByText(ciMessages.ciTab.empty)).toBeInTheDocument();
    expect(screen.getByText("Deployed to no repositories")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ciMessages.ciTab.exportToCi })).toBeInTheDocument();
  });

  it("shows the real installation count and rows once the agent is deployed", () => {
    mockInstallations([
      {
        id: "inst-1",
        agent_id: "agent-1",
        repo: "acme/payments-api",
        target_type: "gha",
        last_run: {
          status: "succeeded",
          ran_at: new Date().toISOString(),
          findings_count: 0,
        },
      },
    ]);
    mockRepublish();
    mockUpdateAgent();
    mockToast();
    renderWithIntl(<CiTab agent={agent()} />);

    expect(screen.getByText("Deployed to 1 repository")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ciMessages.ciTab.addRepo })).toBeInTheDocument();
  });

  it("AC-35 — the three-way gate control reflects the agent's current policy and updates it on click", () => {
    mockInstallations([]);
    mockRepublish();
    mockToast();
    const updateMutate = vi.fn();
    mockUpdateAgent({ mutate: updateMutate });
    renderWithIntl(<CiTab agent={agent({ ci_fail_on: "critical" })} />);

    const criticalOption = screen.getByRole("radio", { name: ciMessages.ciTab.gate.critical });
    const warningOption = screen.getByRole("radio", { name: ciMessages.ciTab.gate.warning });
    const neverOption = screen.getByRole("radio", { name: ciMessages.ciTab.gate.never });

    expect(criticalOption).toHaveAttribute("aria-checked", "true");
    expect(warningOption).toHaveAttribute("aria-checked", "false");
    expect(neverOption).toHaveAttribute("aria-checked", "false");

    fireEvent.click(warningOption);
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "agent-1", patch: { ci_fail_on: "warning" } },
      expect.anything(),
    );
  });
});
