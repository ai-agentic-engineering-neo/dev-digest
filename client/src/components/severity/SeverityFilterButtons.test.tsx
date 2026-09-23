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

const MIXED = { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 };

describe("SeverityFilterButtons", () => {
  it("renders one chip per severity the run HAS, and none for a zero count", () => {
    renderWithIntl(
      <SeverityFilterButtons counts={MIXED} active={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Critical 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning 1" })).toBeInTheDocument();
    // SUGGESTION is 0 — offering it would only lead to an empty list.
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });

  it("shows the count next to each label", () => {
    renderWithIntl(
      <SeverityFilterButtons counts={MIXED} active={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Critical 2" })).toHaveTextContent("Critical2");
  });

  it("renders nothing at all when the run has no findings", () => {
    const { container } = renderWithIntl(
      <SeverityFilterButtons
        counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }}
        active={null}
        onSelect={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for null counts", () => {
    const { container } = renderWithIntl(
      <SeverityFilterButtons counts={null} active={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks only the active severity as pressed", () => {
    renderWithIntl(
      <SeverityFilterButtons counts={MIXED} active="WARNING" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Critical 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Warning 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking an inactive chip selects it", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityFilterButtons counts={MIXED} active={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical 2" }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clicking the already-active chip clears the filter", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityFilterButtons counts={MIXED} active="CRITICAL" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Critical 2" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
