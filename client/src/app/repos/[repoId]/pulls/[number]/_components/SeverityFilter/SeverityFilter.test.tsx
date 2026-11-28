import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilter } from "./SeverityFilter";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const COUNTS = { CRITICAL: 1, WARNING: 3, SUGGESTION: 0 };

describe("SeverityFilter", () => {
  it("shows one counter per level and marks the active one as pressed", () => {
    renderWithIntl(<SeverityFilter counts={COUNTS} active="WARNING" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1 CRITICAL" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "3 WARNING" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "0 SUGGESTION" })).toBeInTheDocument();
  });

  it("selects a level on click and clears it on a second click", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithIntl(<SeverityFilter counts={COUNTS} active={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "1 CRITICAL" }));
    expect(onChange).toHaveBeenLastCalledWith("CRITICAL");

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SeverityFilter counts={COUNTS} active="CRITICAL" onChange={onChange} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "1 CRITICAL" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("disables a level with no findings, unless it is the active filter", () => {
    const { rerender } = renderWithIntl(<SeverityFilter counts={COUNTS} active={null} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "0 SUGGESTION" })).toBeDisabled();

    // Hide-low-confidence can empty the active level; it must stay clickable to clear the filter.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SeverityFilter counts={COUNTS} active="SUGGESTION" onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "0 SUGGESTION" })).toBeEnabled();
  });
});
