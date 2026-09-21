import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiFile, CiExportInputBody } from "@devdigest/shared/contracts/eval-ci";
import ciMessages from "../../../../../../../../../../messages/en/ci.json";
import * as hooks from "@/lib/hooks/ci";
import { PreviewStep } from "./PreviewStep";

/**
 * specs/14-export-to-ci.md (AC-3, P-4/D-P8) — the Preview step lists every
 * generated bundle file. The runner bundle's own files arrive with
 * `contents: null` (P-4's preview-response shaping) and start collapsed;
 * expanding one is what triggers `useCiPreviewFile`'s on-demand fetch — every
 * OTHER file's real contents render immediately, with zero fetch.
 */

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

const INPUT: CiExportInputBody = {
  repo: "acme/target",
  target: "gha",
  action: "files",
  post_as: "github_review",
  triggers: ["opened", "synchronize"],
  base: "main",
};

const EDITABLE_FILE: CiFile = {
  path: ".devdigest/agents/agent.yaml",
  contents: "name: Security Reviewer\n",
  bytes: 25,
  sha256: "abc",
  editable: true,
};

const RUNNER_FILE: CiFile = {
  path: ".devdigest/runner/index.js",
  contents: null,
  bytes: 1_600_000,
  sha256: "def",
  editable: false,
};

function mockPreviewFile(overrides: Partial<ReturnType<typeof hooks.useCiPreviewFile>> = {}) {
  return vi.spyOn(hooks, "useCiPreviewFile").mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof hooks.useCiPreviewFile>);
}

describe("PreviewStep", () => {
  it("lists every generated file's path, showing an editable file's contents immediately with no fetch", () => {
    const spy = mockPreviewFile();
    renderWithIntl(
      <PreviewStep agentId="agent-1" input={INPUT} files={[EDITABLE_FILE, RUNNER_FILE]} isLoading={false} />,
    );

    expect(screen.getByText(EDITABLE_FILE.path)).toBeInTheDocument();
    expect(screen.getByText(RUNNER_FILE.path)).toBeInTheDocument();
    // The editable file's real content is already visible — no expand needed.
    expect(screen.getByText(/name: Security Reviewer/)).toBeInTheDocument();
    // The runner bundle's byte size is shown (D-P8: collapsed by default).
    expect(screen.getByText("1562.5 KB")).toBeInTheDocument();
    // Nothing has fetched the runner file's real bytes yet.
    expect(spy).not.toHaveBeenCalled();
  });

  it("expanding a collapsed runner-bundle file triggers the on-demand fetch, not eager loading", () => {
    const spy = mockPreviewFile({ data: { ...RUNNER_FILE, contents: "console.log('runner');" } });
    renderWithIntl(
      <PreviewStep agentId="agent-1" input={INPUT} files={[EDITABLE_FILE, RUNNER_FILE]} isLoading={false} />,
    );

    // Not fetched while collapsed.
    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(RUNNER_FILE.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));

    // Mounting `RunnerFileContent` calls the hook with this file's own path, enabled.
    expect(spy).toHaveBeenCalledWith("agent-1", INPUT, RUNNER_FILE.path, true);
    expect(screen.getByText("console.log('runner');")).toBeInTheDocument();
  });

  it("shows a loading placeholder, never a file list, before the preview has loaded", () => {
    mockPreviewFile();
    renderWithIntl(<PreviewStep agentId="agent-1" input={INPUT} files={undefined} isLoading={true} />);
    expect(screen.queryByText(EDITABLE_FILE.path)).not.toBeInTheDocument();
  });
});
