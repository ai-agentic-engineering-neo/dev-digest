import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiFile } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/ci.json";

// Hoisted so the vi.mock factories below (which run before the imports they
// mock) can read/write the same objects the tests configure.
const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  secrets: { openrouter: false, github: true, openai: false, anthropic: false },
  secretsLoading: false,
  repos: [] as { full_name: string }[],
}));

vi.mock("@/lib/hooks/ci", () => ({
  useExportCi: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

// TargetStep reads the tracked repos to offer a dropdown; no QueryClient is
// mounted in these tests, so mock the hook. Default (empty) falls back to the
// free-text repo input the existing assertions rely on.
vi.mock("@/lib/hooks/repos", () => ({
  useRepos: () => ({ data: mocks.repos }),
}));

vi.mock("@/lib/hooks/settings", () => ({
  useSecretsStatus: () => ({ data: mocks.secrets, isLoading: mocks.secretsLoading }),
}));

vi.mock("./zip", () => ({
  buildZip: vi.fn(() => new Blob(["zip"], { type: "application/zip" })),
  downloadBlob: vi.fn(),
}));

import { ExportWizard } from "./ExportWizard";
import { buildZip, downloadBlob } from "./zip";

afterEach(cleanup);

const FILES: CiFile[] = [
  { path: ".devdigest/agents/my-agent.yaml", contents: "name: my-agent\n", editable: false },
  { path: ".devdigest/skills/lint.md", contents: "# Lint skill", editable: false },
  { path: ".devdigest/memory.jsonl", contents: "", editable: false },
  { path: ".github/workflows/devdigest.yml", contents: "on: pull_request\n", editable: true },
];

function renderWizard(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <ExportWizard agentId="agent-1" agentName="My Agent" onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

function fillRepoAndContinue(repo = "acme/payments-api") {
  fireEvent.change(screen.getByPlaceholderText("acme/payments-api"), { target: { value: repo } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  mocks.mutateAsync.mockReset();
  mocks.secrets = { openrouter: false, github: true, openai: false, anthropic: false };
  mocks.secretsLoading = false;
  mocks.repos = [];
  mocks.mutateAsync.mockImplementation(async (input: { action: string; repo: string; target: string }) => ({
    installation: {
      id: "inst-1",
      agent_id: "agent-1",
      repo: input.repo,
      target_type: input.target,
      installed_at: "2026-07-08T00:00:00.000Z",
      status: input.action === "open_pr" ? "pr_open" : "active",
      workflow_version: "1",
    },
    files: FILES,
    pr_url: input.action === "open_pr" ? "https://github.com/acme/payments-api/pull/42" : null,
  }));
});

describe("ExportWizard", () => {
  it("renders the four labelled steps with GitHub Actions preselected and badged recommended (AC-1, AC-2)", () => {
    renderWizard();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (const label of ["Target", "Preview", "Configure", "Install"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const ghaRadio = screen.getByRole("radio", { name: /github actions/i });
    expect(ghaRadio).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    // Preview/Configure/Install content isn't mounted yet — step 1 (Target) is active.
    expect(screen.queryByPlaceholderText(/name: my-agent/)).not.toBeInTheDocument();
  });

  it("offers tracked repositories as a searchable dropdown and exports the picked repo", async () => {
    mocks.repos = [{ full_name: "acme/payments-api" }, { full_name: "acme/web" }];
    renderWizard();

    // No free-text input — the dropdown replaces it when repos are available.
    expect(screen.queryByPlaceholderText("acme/payments-api")).not.toBeInTheDocument();

    // Open the dropdown, filter, and pick a repo.
    fireEvent.click(screen.getByText("Search repositories…"));
    fireEvent.change(screen.getByPlaceholderText("Search repositories…"), { target: { value: "web" } });
    fireEvent.click(screen.getByRole("button", { name: /acme\/web/i }));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText(".devdigest/agents/my-agent.yaml");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ repo: "acme/web" }));
  });

  it("Preview lists all four artifact categories, and workflow edits persist into the Install zip (AC-3, AC-4)", async () => {
    renderWizard();
    fillRepoAndContinue();

    expect(await screen.findByText(".devdigest/agents/my-agent.yaml")).toBeInTheDocument();
    expect(screen.getByText(".devdigest/skills/lint.md")).toBeInTheDocument();
    expect(screen.getByText(".devdigest/memory.jsonl")).toBeInTheDocument();
    const workflowTextarea = screen.getByRole("textbox");
    expect(workflowTextarea).toHaveValue("on: pull_request\n");
    fireEvent.change(workflowTextarea, { target: { value: "on: [pull_request]\njobs: {}\n" } });

    // Preview -> Configure -> Install
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByRole("button", { name: /copy files as a zip/i }));

    expect(buildZip).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".github/workflows/devdigest.yml",
          contents: "on: [pull_request]\njobs: {}\n",
        }),
      ]),
    );
    expect(downloadBlob).toHaveBeenCalled();
  });

  it("Configure shows the default toggles/radio and the two secret rows with readiness + hint, no GitHub Secrets call (AC-7, AC-8, AC-9)", async () => {
    renderWizard();
    fillRepoAndContinue();
    await screen.findByText(".devdigest/agents/my-agent.yaml");
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Configure

    expect(screen.getByRole("switch", { name: /^opened$/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /synchronize/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /reopened/i })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /github review/i })).toBeChecked();

    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText(/Add OPENROUTER_API_KEY in Settings/i)).toBeInTheDocument();
    expect(screen.getByText("GITHUB_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("Auto-provided")).toBeInTheDocument();

    // Only the Preview-step files fetch ran — nothing resembling a GitHub
    // Secrets API call was ever issued from Configure.
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ action: "open_pr" }));
  });

  it("opening a PR for a GHA target sends the edited workflow as workflow_override (AC-3)", async () => {
    renderWizard();
    fillRepoAndContinue();

    const workflowTextarea = await screen.findByRole("textbox");
    fireEvent.change(workflowTextarea, { target: { value: "on: [pull_request]\njobs: {}\n" } });

    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Configure
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Install

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await screen.findByText(/pull request opened/i);
    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "open_pr",
        post_as: "github_review",
        workflow_override: "on: [pull_request]\njobs: {}\n",
      }),
    );
  });

  it("the zip path downloads an archive and issues no export/PR mutation (AC-13)", async () => {
    renderWizard();
    fillRepoAndContinue();
    await screen.findByText(".devdigest/agents/my-agent.yaml");
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Configure
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Install

    const callsBeforeZip = mocks.mutateAsync.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /copy files as a zip/i }));

    expect(downloadBlob).toHaveBeenCalled();
    expect(mocks.mutateAsync.mock.calls.length).toBe(callsBeforeZip); // no new mutation call
  });

  it("shows file-download only (no Open a PR action) for a non-GHA target", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("radio", { name: /circleci/i }));
    fillRepoAndContinue();
    await screen.findByText(".devdigest/agents/my-agent.yaml");
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Configure
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> Install

    expect(screen.queryByText("Open a PR with these files")).not.toBeInTheDocument();
    expect(screen.getByText(/only available for GitHub Actions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy files as a zip/i })).toBeInTheDocument();
  });

  it("is an accessible, keyboard-dismissable dialog", () => {
    const { onClose } = renderWizard();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
