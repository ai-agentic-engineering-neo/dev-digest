import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRun } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import ciMessages from "../../../../../../../../messages/en/ci.json";

// Hoisted so vi.mock factories (which run before these imports are used) can
// read/write the same objects the tests configure.
const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  exportMutate: vi.fn(),
  installations: [] as CiInstallation[],
  installationsLoading: false,
  installationsError: false,
  runs: [] as CiRun[],
}));

vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => ({
    data: mocks.installations,
    isLoading: mocks.installationsLoading,
    isError: mocks.installationsError,
    refetch: vi.fn(),
  }),
  useExportCi: () => ({ mutate: mocks.exportMutate, isPending: false }),
}));

vi.mock("@/lib/hooks/ci-runs", () => ({
  useCiRuns: () => ({ data: mocks.runs }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: mocks.updateMutate, isPending: false, isSuccess: false, data: undefined }),
}));

// Render the wizard as a lightweight stand-in — it has its own test suite
// covering its internals; here we only assert it opens/closes.
vi.mock("./ExportWizard", () => ({
  ExportWizard: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-modal="true">
      Export Wizard
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { CiTab } from "./CiTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "agent-1",
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
  attached_doc_paths: [],
};

const INSTALLATION: CiInstallation = {
  id: "inst-1",
  agent_id: "agent-1",
  repo: "acme/payments-api",
  target_type: "gha",
  installed_at: "2026-07-01T00:00:00.000Z",
  status: "active",
  workflow_version: "3",
};

const RUN: CiRun = {
  id: "run-1",
  ci_installation_id: "inst-1",
  pr_id: null,
  repo: "acme/payments-api",
  pr_number: 42,
  ran_at: "2026-07-05T12:00:00.000Z",
  agent: "Security Reviewer",
  status: "succeeded",
  verdict: null,
  findings_count: 2,
  blockers: 0,
  score: 90,
  cost_usd: 0.01,
  duration_s: 12,
  actions_job_url: "https://github.com/acme/payments-api/actions/runs/1",
  source: "ci",
};

function renderCiTab(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, ci: ciMessages }}>
      <CiTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.updateMutate.mockReset();
  mocks.exportMutate.mockReset();
  mocks.installations = [];
  mocks.installationsLoading = false;
  mocks.installationsError = false;
  mocks.runs = [];
});

describe("CiTab", () => {
  it("renders installation status, workflow version, and run history (AC-34)", () => {
    mocks.installations = [INSTALLATION];
    mocks.runs = [RUN];
    renderCiTab();

    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
  });

  it("clicking Add to CI opens the Export Wizard (AC-1)", () => {
    renderCiTab();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Two "Export to CI" buttons render when the list is empty (header CTA +
    // EmptyState CTA) — either one opens the same wizard.
    const [addToCi] = screen.getAllByRole("button", { name: "Export to CI" });
    fireEvent.click(addToCi!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("changing Fail CI on issues an agent update carrying ci_fail_on (AC-35)", () => {
    renderCiTab();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "any" } });

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-1", patch: expect.objectContaining({ ci_fail_on: "any" }) }),
    );
  });

  it("clicking Update CI config re-runs the export for the existing installation (AC-11)", () => {
    mocks.installations = [INSTALLATION];
    renderCiTab();

    fireEvent.click(screen.getByRole("button", { name: "Update CI" }));

    expect(mocks.exportMutate).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "acme/payments-api", target: "gha", action: "open_pr" }),
      expect.anything(),
    );
  });
});
