import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import type { PrMeta } from "@/lib/types";
import { LATEST_IDS, REVIEWS } from "./fixtures.test-data";

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (...args: unknown[]) => usePrReviews(...args),
}));

import { FindingsCell } from "./FindingsCell";

beforeEach(() => {
  usePrReviews.mockReturnValue({ data: REVIEWS, isLoading: false, isError: false });
});
afterEach(() => {
  cleanup();
  usePrReviews.mockReset();
  vi.useRealTimers();
});

function pr(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 9,
    title: "PR",
    author: "dev",
    branch: "b",
    base: "main",
    head_sha: "abc",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "reviewed",
    score: 0,
    findings: { critical: 2, warning: 1, suggestion: 1 },
    latest_review_ids: LATEST_IDS,
    ...overrides,
  };
}

function renderCell(p: PrMeta, onRowClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <div onClick={onRowClick}>
        <FindingsCell pr={p} />
      </div>
    </NextIntlClientProvider>,
  );
  return { onRowClick };
}

const trigger = () => screen.getByRole("button", { name: "2 critical, 1 warning, 1 suggestion findings" });

describe("FindingsCell", () => {
  it("shows an em-dash for never-reviewed PRs", () => {
    renderCell(pr({ findings: null, latest_review_ids: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows 'None' when every agent came back clean", () => {
    renderCell(pr({ findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("renders a count per non-zero severity", () => {
    renderCell(pr({ findings: { critical: 3, warning: 0, suggestion: 2 } }));
    const btn = screen.getByRole("button", { name: "3 critical, 0 warning, 2 suggestion findings" });
    expect(btn.querySelector('[data-severity="CRITICAL"]')).toHaveTextContent("3");
    expect(btn.querySelector('[data-severity="WARNING"]')).toBeNull();
    expect(btn.querySelector('[data-severity="SUGGESTION"]')).toHaveTextContent("2");
  });

  it("does not fetch reviews until the popover opens", () => {
    renderCell(pr());
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1", false);
    fireEvent.mouseEnter(trigger());
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1", true);
  });

  it("opens on hover with the open findings of each agent's latest review", () => {
    renderCell(pr());
    fireEvent.mouseEnter(trigger());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("4 findings")).toBeInTheDocument();
    const titles = within(dialog).getAllByText(/^(CRITICAL|WARNING|SUGGESTION) /).map((el) => el.textContent);
    expect(titles).toEqual(["CRITICAL c-high", "CRITICAL c-low", "WARNING w1", "SUGGESTION s1"]);
    expect(within(dialog).queryByText("CRITICAL c-dismissed")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("CRITICAL old")).not.toBeInTheDocument();
    expect(within(dialog).getByText("src/c-high.ts:10")).toBeInTheDocument();
  });

  it("closes shortly after the pointer leaves, unless it was pinned by a click", () => {
    vi.useFakeTimers();
    renderCell(pr());
    fireEvent.mouseEnter(trigger());
    fireEvent.mouseLeave(trigger());
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.mouseLeave(trigger());
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a second click, Escape, or an outside click closes a pinned popover", () => {
    renderCell(pr());
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking the counts does not navigate the row", () => {
    const { onRowClick } = renderCell(pr());
    fireEvent.click(trigger());
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows loading and error states", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderCell(pr());
    fireEvent.click(trigger());
    expect(screen.getByLabelText("Loading findings…")).toBeInTheDocument();
    cleanup();
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderCell(pr());
    fireEvent.click(trigger());
    expect(screen.getByText("Couldn’t load findings.")).toBeInTheDocument();
  });
});
