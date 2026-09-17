/**
 * FindingsCell — the PR-list FINDINGS column cell: compact severity pills
 * plus a read-only hover popover («N FINDINGS IN THIS RUN»). The popover is
 * previews only — severity icon, title, category, file:line, % confidence,
 * clamped rationale — and must contain no buttons.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

import { FindingsCell } from "./FindingsCell";

vi.useFakeTimers();
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});

const PREVIEWS: FindingPreview[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    rationale: "Line 12 contains a literal sk_live_ key.",
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    confidence: 0.86,
    rationale: "Loop issues one query per user.",
  },
];

function renderCell(findings: FindingPreview[] = PREVIEWS) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell findings={findings} />
    </NextIntlClientProvider>,
  );
}

/** mouseEnter → the 100ms hover-intent delay → popover open. */
function hoverOpen() {
  fireEvent.mouseEnter(screen.getByLabelText("2 findings"));
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

describe("FindingsCell — empty state", () => {
  it("renders an em-dash and never mounts a popover", () => {
    renderCell([]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/findings in this run/i)).not.toBeInTheDocument();
  });
});

describe("FindingsCell — hover popover", () => {
  it("opens after the hover delay with the N FINDINGS IN THIS RUN header", () => {
    renderCell();
    expect(screen.queryByText(/findings in this run/i)).not.toBeInTheDocument();
    hoverOpen();
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
  });

  it("previews each finding read-only: title, file:line, confidence, rationale — no buttons", () => {
    renderCell();
    hoverOpen();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    // Crit 21: read-only — not a single button anywhere in the cell.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("closes after the leave delay, unless the cursor moves into the popover", () => {
    renderCell();
    hoverOpen();

    // Leaving the cell schedules a close; entering the popover cancels it.
    fireEvent.mouseLeave(screen.getByLabelText("2 findings"));
    fireEvent.mouseEnter(screen.getByText("2 findings in this run"));
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();

    // Leaving the popover itself closes it.
    fireEvent.mouseLeave(screen.getByText("2 findings in this run"));
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(screen.queryByText(/findings in this run/i)).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderCell();
    const cell = screen.getByLabelText("2 findings");
    fireEvent.focus(cell);
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(screen.queryByText(/findings in this run/i)).not.toBeInTheDocument();
  });

  it("scrolling INSIDE the popover (reading its list) keeps it open", () => {
    renderCell();
    hoverOpen();
    const popover = screen.getByText("2 findings in this run").closest("div");
    expect(popover).toBeTruthy();
    // A scroll event whose target is the popover itself is reading, not navigation.
    fireEvent.scroll(popover!);
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
  });

  it("scrolling the page with the row out of view closes the popover", () => {
    renderCell();
    hoverOpen();
    // Row scrolled out of the viewport → nothing left to anchor to.
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ top: -500, bottom: -450 } as DOMRect);
    fireEvent.scroll(window);
    rectSpy.mockRestore();
    expect(screen.queryByText(/findings in this run/i)).not.toBeInTheDocument();
  });

  it("tallies severity pills client-side from the previews", () => {
    renderCell();
    // One compact badge per present severity: CRITICAL and WARNING (counts 1/1).
    expect(screen.getByLabelText("2 findings")).toBeInTheDocument();
    expect(screen.queryByText("Suggestion")).not.toBeInTheDocument();
  });
});
