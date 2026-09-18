/**
 * FilterBar — the "Last synced" indicator next to Refresh. The wording lives in
 * this component, not in `relativeTime()` (PRRow's Updated column depends on
 * that helper's terse "12m"/"3h"/"2d" form staying suffix-free).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

function renderBar(lastSyncedAt?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FilterBar
        active="all"
        onActive={vi.fn()}
        query=""
        onQuery={vi.fn()}
        sort="newest"
        onSort={vi.fn()}
        onRefresh={vi.fn()}
        refreshing={false}
        lastSyncedAt={lastSyncedAt}
      />
    </NextIntlClientProvider>,
  );
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("FilterBar — Last synced", () => {
  it("reads 'Last synced just now' for a sub-minute timestamp", () => {
    renderBar(minutesAgo(0));
    expect(screen.getByText("Last synced just now")).toBeInTheDocument();
  });

  it("reads 'Last synced {x} ago' for an older timestamp", () => {
    renderBar(minutesAgo(12));
    expect(screen.getByText("Last synced 12m ago")).toBeInTheDocument();
  });

  it("uses hours/days the same way the Updated column does", () => {
    renderBar(minutesAgo(60 * 3));
    expect(screen.getByText("Last synced 3h ago")).toBeInTheDocument();
    cleanup();
    renderBar(minutesAgo(60 * 24 * 2));
    expect(screen.getByText("Last synced 2d ago")).toBeInTheDocument();
  });

  it("renders nothing when the repo has never been synced (null)", () => {
    renderBar(null);
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });

  it("renders nothing when the prop is omitted entirely", () => {
    renderBar(undefined);
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });

  it("renders nothing for an unparseable timestamp (relativeTime's '—')", () => {
    renderBar("not-a-date");
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });

  it("does not disturb the existing Refresh button", () => {
    renderBar(minutesAgo(5));
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });
});
