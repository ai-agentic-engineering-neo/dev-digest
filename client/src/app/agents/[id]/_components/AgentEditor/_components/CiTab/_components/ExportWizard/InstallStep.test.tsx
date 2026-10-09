import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiExportInputBody } from "@devdigest/shared/contracts/eval-ci";
import ciMessages from "../../../../../../../../../../messages/en/ci.json";
import * as hooks from "@/lib/hooks/ci";
import { InstallStep } from "./InstallStep";

/**
 * specs/14-export-to-ci.md AC-5/AC-6/AC-10/AC-10a/AC-59 — the "open a PR"
 * and "download as zip" options are CONCURRENT peers, both always present
 * and enabled. Also a regression test for the hardcoded-`5` file-count bug:
 * the Install card must render the REAL count passed in via `fileCount`,
 * never a literal `5`.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

const INPUT: CiExportInputBody = {
  repo: "acme/target-repo",
  target: "gha",
  action: "open_pr",
  post_as: "github_review",
  triggers: ["opened", "synchronize"],
  base: "main",
};

describe("InstallStep", () => {
  it("both the PR option and the archive-download option are present and enabled", () => {
    renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={vi.fn()}
        isExporting={false}
        result={null}
        fileCount={7}
      />,
    );

    const installButton = screen.getByRole("button", { name: ciMessages.exportWizard.install });
    const downloadButton = screen.getByRole("button", { name: ciMessages.exportWizard.downloadArchive });
    expect(installButton).toBeEnabled();
    expect(downloadButton).toBeEnabled();
  });

  it("clicking 'Install' calls onOpenPr", () => {
    const onOpenPr = vi.fn();
    renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={onOpenPr}
        isExporting={false}
        result={null}
        fileCount={7}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: ciMessages.exportWizard.install }));
    expect(onOpenPr).toHaveBeenCalled();
  });

  it("regression: renders the REAL file count from props (7), never the previously-hardcoded 5", () => {
    renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={vi.fn()}
        isExporting={false}
        result={null}
        fileCount={7}
      />,
    );
    expect(
      screen.getByText(
        ciMessages.exportWizard.installCardBody
          .replace("{repo}", INPUT.repo!)
          .replace("{count}", "7"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\b5 generated files\b/)).not.toBeInTheDocument();
  });

  it("shows the loading copy (no count) instead of a fabricated number while the preview hasn't resolved yet", () => {
    renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={vi.fn()}
        isExporting={false}
        result={null}
        fileCount={undefined}
      />,
    );
    expect(
      screen.getByText(ciMessages.exportWizard.installCardBodyLoading.replace("{repo}", INPUT.repo!)),
    ).toBeInTheDocument();
  });

  it("downloading the archive calls exportCiArchive and triggers a browser download", async () => {
    const blob = new Blob(["zip-bytes"]);
    const exportSpy = vi.spyOn(hooks, "exportCiArchive").mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={vi.fn()}
        isExporting={false}
        result={null}
        fileCount={7}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: ciMessages.exportWizard.downloadArchive }));

    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith("agent-1", INPUT));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
  });

  it("shows the refused reason and a PR link from a completed result", () => {
    const { rerender } = renderWithIntl(
      <InstallStep
        agentId="agent-1"
        input={INPUT}
        onOpenPr={vi.fn()}
        isExporting={false}
        result={{
          installation: null,
          files: [],
          pr_url: null,
          reused_pr: false,
          warnings: [],
          refused_reason: "This repository already has a DevDigest CI installation for a different agent.",
        }}
        fileCount={7}
      />,
    );
    expect(
      screen.getByText("This repository already has a DevDigest CI installation for a different agent."),
    ).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <InstallStep
          agentId="agent-1"
          input={INPUT}
          onOpenPr={vi.fn()}
          isExporting={false}
          result={{
            installation: null,
            files: [],
            pr_url: "https://github.com/acme/target-repo/pull/9",
            reused_pr: false,
            warnings: [],
            refused_reason: null,
          }}
          fileCount={7}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: ciMessages.exportWizard.viewPr })).toHaveAttribute(
      "href",
      "https://github.com/acme/target-repo/pull/9",
    );
  });
});
