import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

function renderBar(over: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props: React.ComponentProps<typeof FilterBar> = {
    active: "all",
    onActive: vi.fn(),
    query: "",
    onQuery: vi.fn(),
    sort: "newest",
    onSort: vi.fn(),
    onRefresh: vi.fn(),
    refreshing: false,
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FilterBar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("FilterBar", () => {
  it("renders one chip per status filter and reports the clicked key", () => {
    const props = renderBar();
    for (const label of ["All", "Needs review", "Reviewed", "Stale"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Stale"));
    expect(props.onActive).toHaveBeenCalledWith("stale");
  });

  it("forwards typing in the search box", () => {
    const props = renderBar();
    fireEvent.change(screen.getByPlaceholderText("Filter pull requests…"), { target: { value: "auth" } });
    expect(props.onQuery).toHaveBeenCalledWith("auth");
  });

  it("refresh is clickable when idle and disabled while refreshing", () => {
    const idle = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(idle.onRefresh).toHaveBeenCalledTimes(1);
    cleanup();
    renderBar({ refreshing: true });
    expect(screen.getByRole("button", { name: /Refreshing…/ })).toBeDisabled();
  });
});
