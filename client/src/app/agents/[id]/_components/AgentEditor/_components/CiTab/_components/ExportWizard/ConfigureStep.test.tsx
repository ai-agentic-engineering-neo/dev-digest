import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiSecretStatus } from "@devdigest/shared/contracts/eval-ci";
import ciMessages from "../../../../../../../../../../messages/en/ci.json";
import { ConfigureStep } from "./ConfigureStep";
import { DEFAULT_TRIGGERS } from "./constants";

/**
 * specs/14-export-to-ci.md AC-4/AC-4a/AC-4b — trigger selection, the
 * recommended publishing mode, and the merge-blocking guidance line as
 * VISIBLE text (never only a tooltip).
 */

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

const SECRETS: CiSecretStatus[] = [
  { name: "OPENROUTER_API_KEY", required: true, state: "configured", provided_by_ci: false },
  { name: "GITHUB_TOKEN", required: true, state: "configured", provided_by_ci: true },
];

describe("ConfigureStep", () => {
  it("AC-4 — defaults to opened+synchronize checked, reopened unchecked, matching DEFAULT_TRIGGERS", () => {
    renderWithIntl(
      <ConfigureStep
        secrets={SECRETS}
        triggers={DEFAULT_TRIGGERS}
        onTriggers={vi.fn()}
        postAs="github_review"
        onPostAs={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: ciMessages.exportWizard.triggers.opened })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: ciMessages.exportWizard.triggers.synchronize }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("checkbox", { name: ciMessages.exportWizard.triggers.reopened }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("toggling a trigger checkbox calls onTriggers with the updated set", () => {
    const onTriggers = vi.fn();
    renderWithIntl(
      <ConfigureStep
        secrets={SECRETS}
        triggers={DEFAULT_TRIGGERS}
        onTriggers={onTriggers}
        postAs="github_review"
        onPostAs={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: ciMessages.exportWizard.triggers.reopened }));
    expect(onTriggers).toHaveBeenCalledWith([...DEFAULT_TRIGGERS, "reopened"]);
  });

  it('AC-4a — "GitHub review" is marked recommended and selecting it calls onPostAs', () => {
    const onPostAs = vi.fn();
    renderWithIntl(
      <ConfigureStep
        secrets={SECRETS}
        triggers={DEFAULT_TRIGGERS}
        onTriggers={vi.fn()}
        postAs="pr_comment"
        onPostAs={onPostAs}
      />,
    );

    const reviewRadio = screen.getByRole("radio", { name: new RegExp(ciMessages.exportWizard.postAs.githubReview) });
    expect(reviewRadio).toBeInTheDocument();
    // The "recommended" badge sits specifically alongside GitHub review, not
    // PR comment or None.
    const reviewLabel = reviewRadio.closest("label")!;
    expect(reviewLabel.textContent).toContain(ciMessages.exportWizard.recommended);
    const commentLabel = screen
      .getByRole("radio", { name: new RegExp(ciMessages.exportWizard.postAs.prComment) })
      .closest("label")!;
    expect(commentLabel.textContent).not.toContain(ciMessages.exportWizard.recommended);

    fireEvent.click(reviewRadio);
    expect(onPostAs).toHaveBeenCalledWith("github_review");
  });

  it("AC-4b — the merge-blocking guidance renders as visible page text, not only inside a tooltip", () => {
    renderWithIntl(
      <ConfigureStep
        secrets={SECRETS}
        triggers={DEFAULT_TRIGGERS}
        onTriggers={vi.fn()}
        postAs="github_review"
        onPostAs={vi.fn()}
      />,
    );
    expect(screen.getByText(ciMessages.exportWizard.blockMergeTitle, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(ciMessages.exportWizard.blockMergeDesc, { exact: false })).toBeInTheDocument();
  });

  it("AC-64 — renders each secret's configured/missing/unknown/provided-by-CI state", () => {
    renderWithIntl(
      <ConfigureStep
        secrets={[
          { name: "OPENROUTER_API_KEY", required: true, state: "missing", provided_by_ci: false },
          { name: "GITHUB_TOKEN", required: true, state: "configured", provided_by_ci: true },
        ]}
        triggers={DEFAULT_TRIGGERS}
        onTriggers={vi.fn()}
        postAs="github_review"
        onPostAs={vi.fn()}
      />,
    );
    expect(screen.getByText(ciMessages.exportWizard.secretMissing)).toBeInTheDocument();
    expect(screen.getByText(ciMessages.exportWizard.secretProvidedByCi)).toBeInTheDocument();
  });
});
