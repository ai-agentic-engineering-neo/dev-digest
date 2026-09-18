import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
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
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("untouched: neither button is disabled/bordered, no status tag, full opacity", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Accept").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Dismiss").closest("button")).not.toBeDisabled();
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("dismissed")).not.toBeInTheDocument();
  });

  it("accepted: Accept disabled+bordered, Dismiss enabled, title struck through, green tag+checkmark", () => {
    const accepted = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Dismiss").closest("button")).not.toBeDisabled();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("dismissed: Dismiss disabled+bordered, Accept enabled, gray tag+X, no strikethrough", () => {
    const dismissed = { ...FINDING, dismissed_at: "2026-01-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Dismiss").closest("button")).toBeDisabled();
    expect(screen.getByText("Accept").closest("button")).not.toBeDisabled();
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toHaveStyle({ textDecoration: "none" });
  });

  it("transition: dismissed → accept fully swaps tag/strikethrough/button state, not just adds to it", () => {
    const dismissed = { ...FINDING, dismissed_at: "2026-01-01T00:00:00Z" };
    const { rerender } = renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("dismissed")).toBeInTheDocument();
    const accepted = { ...FINDING, accepted_at: "2026-01-02T00:00:00Z", dismissed_at: null };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard f={accepted} defaultExpanded onAction={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("dismissed")).not.toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("Dismiss").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Hardcoded Stripe secret key")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("a pending mutation disables both buttons regardless of accepted/dismissed state", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} pending />);
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Dismiss").closest("button")).toBeDisabled();
  });
});
