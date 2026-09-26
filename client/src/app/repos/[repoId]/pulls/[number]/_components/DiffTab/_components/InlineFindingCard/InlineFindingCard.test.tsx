/**
 * InlineFindingCard — the finding written out in full under the diff line it
 * cites (Smart Order, L03): severity word, title, line range, the suggested
 * fix box (present only with a suggestion), Accept/Dismiss, the accepted /
 * dismissed tags, and the ✕ collapse button (present only with `onClose`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { InlineFindingCard } from "./InlineFindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 61,
  end_line: 74,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("InlineFindingCard", () => {
  it("shows the severity word for CRITICAL: blocker", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("shows the finding's title", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });

  it('shows "line 61-74" for a finding that spans multiple lines', () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.getByText("line 61-74")).toBeInTheDocument();
  });

  it('shows "line 5" for a single-line finding', () => {
    const single: FindingRecord = { ...FINDING, start_line: 5, end_line: 5 };
    renderWithIntl(<InlineFindingCard f={single} onAction={() => {}} />);
    expect(screen.getByText("line 5")).toBeInTheDocument();
  });

  it("shows the suggested fix box when a suggestion is present", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Move the key to an environment variable.")).toBeInTheDocument();
  });

  it("hides the suggested fix box when there is no suggestion", () => {
    const noSuggestion: FindingRecord = { ...FINDING, suggestion: null };
    renderWithIntl(<InlineFindingCard f={noSuggestion} onAction={() => {}} />);
    expect(screen.queryByText("Suggested fix")).not.toBeInTheDocument();
  });

  it("Accept / Dismiss call onAction with the action kind", () => {
    const onAction = vi.fn();
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("renders no collapse (✕) button when onClose is absent (the unanchored block)", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "Collapse finding" })).not.toBeInTheDocument();
  });

  it("renders the collapse (✕) button when onClose is passed, and calls it on click", () => {
    const onClose = vi.fn();
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse finding" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the accepted tag for an accepted finding", () => {
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-09-01T00:00:00Z" };
    renderWithIntl(<InlineFindingCard f={accepted} onAction={() => {}} />);
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.queryByText("dismissed")).not.toBeInTheDocument();
  });

  it("shows the dismissed tag for a dismissed finding", () => {
    const dismissed: FindingRecord = { ...FINDING, dismissed_at: "2026-09-01T00:00:00Z" };
    renderWithIntl(<InlineFindingCard f={dismissed} onAction={() => {}} />);
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
  });
});
