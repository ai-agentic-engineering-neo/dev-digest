import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SeverityPills", () => {
  it("renders only non-zero severities", () => {
    renderWithIntl(<SeverityPills counts={{ CRITICAL: 3, WARNING: 0, SUGGESTION: 2 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders nothing (not even a wrapper) when all counts are zero or missing", () => {
    const { container } = renderWithIntl(
      <SeverityPills counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for null counts", () => {
    const { container } = renderWithIntl(<SeverityPills counts={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("without onSelect, renders plain (non-interactive) spans — no buttons", () => {
    renderWithIntl(<SeverityPills counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("with onSelect, each non-zero pill is a real button that calls back with its severity", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityPills counts={{ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 }} onSelect={onSelect} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Show only Critical findings"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("never claims a pressed state — it reports, it does not filter (that's SeverityFilterButtons)", () => {
    renderWithIntl(
      <SeverityPills counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("stops the click from bubbling (a parent row's onClick must not also fire)", () => {
    const onSelect = vi.fn();
    const onRowClick = vi.fn();
    renderWithIntl(
      <div onClick={onRowClick}>
        <SeverityPills counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} onSelect={onSelect} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
