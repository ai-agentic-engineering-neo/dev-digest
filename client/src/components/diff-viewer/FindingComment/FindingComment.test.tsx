import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/prReview.json";
import { FindingComment } from "./FindingComment";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "The key is committed in plaintext.",
  suggestion: "Move it to an env var.",
  confidence: 0.98,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderIt(f: FindingRecord, onAction = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingComment finding={f} onAction={onAction} />
    </NextIntlClientProvider>,
  );
  return onAction;
}

afterEach(cleanup);

describe("FindingComment", () => {
  it("shows severity, title, rationale and the suggested fix", () => {
    renderIt(FINDING);
    expect(screen.getByText("Hardcoded key")).toBeTruthy();
    expect(screen.getByText("The key is committed in plaintext.")).toBeTruthy();
    expect(screen.getByText("Move it to an env var.")).toBeTruthy();
    expect(screen.getByText(/line 12 · 98% conf/)).toBeTruthy();
  });

  it("calls onAction with accept and dismiss", async () => {
    const user = userEvent.setup();
    const onAction = renderIt(FINDING);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onAction).toHaveBeenNthCalledWith(1, "f1", "accept");
    expect(onAction).toHaveBeenNthCalledWith(2, "f1", "dismiss");
  });

  it("collapses to one line with the close button and re-expands on click", async () => {
    const user = userEvent.setup();
    renderIt(FINDING);
    await user.click(screen.getByRole("button", { name: "Collapse finding" }));
    expect(screen.queryByText("The key is committed in plaintext.")).toBeNull();
    expect(screen.getByText("Hardcoded key")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Hardcoded key/ }));
    expect(screen.getByText("The key is committed in plaintext.")).toBeTruthy();
  });

  it("marks a dismissed finding as rejected", () => {
    renderIt({ ...FINDING, dismissed_at: "2026-01-01T00:00:00Z" });
    expect(screen.getByText("rejected")).toBeTruthy();
  });
});
