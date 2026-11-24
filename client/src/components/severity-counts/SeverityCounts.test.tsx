import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounts } from "./SeverityCounts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BASE: FindingRecord = {
  id: "x",
  severity: "WARNING",
  category: "perf",
  title: "",
  file: "src/api/users.ts",
  start_line: 45,
  end_line: 52,
  rationale: "Loop issues one query per user.",
  suggestion: null,
  confidence: 0.86,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const f = (id: string, severity: FindingRecord["severity"], title: string, extra: Partial<FindingRecord> = {}) =>
  ({ ...BASE, id, severity, title, ...extra }) as FindingRecord;

// 2 CRITICAL · 1 WARNING · 0 SUGGESTION
const RUN = [
  f("w1", "WARNING", "N+1 query in user list endpoint"),
  f("c1", "CRITICAL", "Hardcoded secret", { dismissed_at: "2026-11-24T10:00:00Z" }),
  f("c2", "CRITICAL", "SQL injection in search"),
];

function renderCounts(findings: FindingRecord[], onParentClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {/* Stands in for the accordion header, which toggles on click / Enter. */}
      <div role="button" onClick={onParentClick} onKeyDown={onParentClick}>
        <SeverityCounts findings={findings} />
      </div>
    </NextIntlClientProvider>,
  );
  return onParentClick;
}

const trigger = (name: RegExp) => screen.getByRole("button", { name });
const popover = () => screen.queryByRole("dialog");

describe("SeverityCounts", () => {
  it("shows an icon + count only for levels that have findings", () => {
    renderCounts(RUN);
    const group = screen.getByRole("group", { name: "Findings by severity" });
    expect(group).toHaveTextContent("21");
    expect(trigger(/^2 Critical/)).toBeInTheDocument();
    expect(trigger(/^1 Warning/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).toBeNull();
  });

  it("renders nothing for a run without findings", () => {
    renderCounts([]);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("hover opens the popover with every finding of the run, severity first", () => {
    vi.useFakeTimers();
    renderCounts(RUN);
    fireEvent.mouseEnter(screen.getByRole("group"));
    const dialog = popover()!;
    expect(dialog).toHaveAccessibleName("3 findings");
    const items = Array.from(dialog.querySelectorAll("li")).map((li) => li.textContent);
    expect(items[0]).toContain("Hardcoded secret");
    expect(items[0]).toContain(messages.finding.dismissed);
    expect(items[1]).toContain("SQL injection in search");
    expect(items[2]).toContain("N+1 query in user list endpoint");
    expect(items[2]).toContain("src/api/users.ts:45-52");
    expect(items[2]).toContain("86% conf");

    fireEvent.mouseLeave(screen.getByRole("group"));
    act(() => vi.advanceTimersByTime(200));
    expect(popover()).toBeNull();
  });

  it("moving the pointer into the popover keeps it open", () => {
    vi.useFakeTimers();
    renderCounts(RUN);
    fireEvent.mouseEnter(screen.getByRole("group"));
    fireEvent.mouseLeave(screen.getByRole("group"));
    fireEvent.mouseEnter(popover()!);
    act(() => vi.advanceTimersByTime(500));
    expect(popover()).toBeInTheDocument();
  });

  it("click pins it open without toggling the run; click again or Escape closes", () => {
    vi.useFakeTimers();
    const onParent = renderCounts(RUN);
    fireEvent.click(trigger(/^1 Warning/));
    expect(popover()).toBeInTheDocument();
    expect(trigger(/^1 Warning/)).toHaveAttribute("aria-expanded", "true");

    // Pinned: leaving with the pointer doesn't close it.
    fireEvent.mouseLeave(screen.getByRole("group"));
    act(() => vi.advanceTimersByTime(500));
    expect(popover()).toBeInTheDocument();

    // Clicks inside the popover don't reach the accordion header either.
    fireEvent.click(popover()!);
    fireEvent.click(trigger(/^1 Warning/));
    expect(popover()).toBeNull();
    expect(onParent).not.toHaveBeenCalled();

    fireEvent.click(trigger(/^2 Critical/));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(popover()).toBeNull();
  });

  it("a click outside closes the pinned popover", () => {
    renderCounts(RUN);
    fireEvent.click(trigger(/^2 Critical/));
    fireEvent.mouseDown(document.body);
    expect(popover()).toBeNull();
  });
});
