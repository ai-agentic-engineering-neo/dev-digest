import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityCounters } from "./SeverityCounters";
import type { SeverityCount } from "../types";

afterEach(cleanup);

const COUNTS: SeverityCount[] = [
  { severity: "CRITICAL", count: 1 },
  { severity: "WARNING", count: 3 },
];

function setup(active: "CRITICAL" | "WARNING" | null = null, counts = COUNTS) {
  const onSelect = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounters counts={counts} active={active} onSelect={onSelect} onOpenDetails={onOpenDetails} />
    </NextIntlClientProvider>,
  );
  return { onSelect, onOpenDetails };
}

describe("SeverityCounters", () => {
  it("renders one chip per non-zero severity with its count", () => {
    setup();
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 WARNING" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
  });

  it("renders nothing when there are no findings", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SeverityCounters counts={[]} active={null} onSelect={vi.fn()} onOpenDetails={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reflects the active severity via aria-pressed", () => {
    setup("WARNING");
    expect(screen.getByRole("button", { name: "3 WARNING" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects an inactive severity on click", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: "3 WARNING" }));
    expect(onSelect).toHaveBeenCalledWith("WARNING");
  });

  it("clears the filter when the active chip is clicked again", () => {
    const { onSelect } = setup("WARNING");
    fireEvent.click(screen.getByRole("button", { name: "3 WARNING" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("opens details from the info button without filtering", () => {
    const { onSelect, onOpenDetails } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show CRITICAL findings" }));
    expect(onOpenDetails).toHaveBeenCalledWith("CRITICAL");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows 'Clear filter' only while a filter is active", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Clear filter" })).not.toBeInTheDocument();
    cleanup();
    const { onSelect } = setup("CRITICAL");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
