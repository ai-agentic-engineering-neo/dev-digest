import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityFilterButtons } from "./SeverityFilterButtons";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SeverityFilterButtons", () => {
  it("always renders all three buttons, even when nothing is active", () => {
    renderWithIntl(<SeverityFilterButtons active={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggestion" })).toBeInTheDocument();
  });

  it("marks only the active severity as pressed", () => {
    renderWithIntl(<SeverityFilterButtons active="WARNING" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Critical" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Warning" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Suggestion" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking an inactive button selects it", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SeverityFilterButtons active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clicking the already-active button clears the filter", () => {
    const onSelect = vi.fn();
    renderWithIntl(<SeverityFilterButtons active="CRITICAL" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
