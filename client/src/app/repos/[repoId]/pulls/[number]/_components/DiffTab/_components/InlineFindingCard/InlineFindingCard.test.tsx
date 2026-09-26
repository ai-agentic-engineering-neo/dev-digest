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
  it("shows the finding's details and a suggested fix, and lets the user act on it", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("line 61-74")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Move the key to an environment variable.")).toBeInTheDocument();

    const onAction = vi.fn();
    cleanup();
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");

    // A single-line finding shows "line N" instead of a range.
    cleanup();
    const single: FindingRecord = { ...FINDING, start_line: 5, end_line: 5 };
    renderWithIntl(<InlineFindingCard f={single} onAction={() => {}} />);
    expect(screen.getByText("line 5")).toBeInTheDocument();

    // With no suggestion, the fix box is omitted entirely.
    cleanup();
    const noSuggestion: FindingRecord = { ...FINDING, suggestion: null };
    renderWithIntl(<InlineFindingCard f={noSuggestion} onAction={() => {}} />);
    expect(screen.queryByText("Suggested fix")).not.toBeInTheDocument();
  });

  it("shows a collapse control only when onClose is provided, and calls it", () => {
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "Collapse finding" })).not.toBeInTheDocument();

    cleanup();
    const onClose = vi.fn();
    renderWithIntl(<InlineFindingCard f={FINDING} onAction={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse finding" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows exactly one status tag matching the finding's acceptance state", () => {
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-09-01T00:00:00Z" };
    renderWithIntl(<InlineFindingCard f={accepted} onAction={() => {}} />);
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.queryByText("dismissed")).not.toBeInTheDocument();

    cleanup();
    const dismissed: FindingRecord = { ...FINDING, dismissed_at: "2026-09-01T00:00:00Z" };
    renderWithIntl(<InlineFindingCard f={dismissed} onAction={() => {}} />);
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
  });
});
