import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindings } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FINDINGS: PrFindings = {
  counts: { CRITICAL: 1, WARNING: 2 },
  total: 3,
  previews: [
    {
      severity: "CRITICAL",
      title: "Hardcoded secret",
      category: "security",
      file: "src/config.ts",
      line: 12,
      confidence: 0.98,
      description: "A secret is committed.",
    },
  ],
};

describe("FindingsCell", () => {
  it("shows a placeholder when there is nothing to show (AC-2)", () => {
    renderWithIntl(<FindingsCell findings={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens a preview on hover, headed with the run's full count (AC-4)", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));
    expect(screen.getByText("3 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
  });

  it("closes when the pointer leaves (AC-10)", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    const cell = screen.getByTestId("findings-cell");
    fireEvent.mouseEnter(cell);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders no actionable control (AC-6)", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    fireEvent.focus(screen.getByTestId("findings-cell"));
    const panel = screen.getByRole("dialog");
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).queryAllByRole("link")).toHaveLength(0);
  });

  it("opens on focus and closes on Escape (AC-11)", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    const cell = screen.getByTestId("findings-cell");
    fireEvent.focus(cell);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(cell, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the panel open for a focused keyboard reader when the mouse passes over and leaves", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    const cell = screen.getByTestId("findings-cell");
    fireEvent.mouseEnter(cell);
    fireEvent.focus(cell);
    fireEvent.mouseLeave(cell);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a click does not fall through to the row underneath", () => {
    const rowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={rowClick}>
          <FindingsCell findings={FINDINGS} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("findings-cell"));
    expect(rowClick).not.toHaveBeenCalled();
  });
  it("renders the panel outside the cell, so a clipping ancestor cannot cut it", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    const cell = screen.getByTestId("findings-cell");
    fireEvent.mouseEnter(cell);

    const panel = screen.getByRole("dialog");
    expect(cell.contains(panel)).toBe(false);
    expect(screen.getByTestId("findings-preview-portal").parentElement).toBe(document.body);
  });

  it("stays open while the pointer is over the panel itself", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    fireEvent.mouseEnter(screen.getByTestId("findings-cell"));

    fireEvent.mouseEnter(screen.getByTestId("findings-preview-portal"));
    fireEvent.mouseLeave(screen.getByTestId("findings-cell"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens above the icons when the row sits near the bottom of the viewport", () => {
    renderWithIntl(<FindingsCell findings={FINDINGS} />);
    const cell = screen.getByTestId("findings-cell");
    cell.getBoundingClientRect = () =>
      ({ top: 700, bottom: 720, left: 100, right: 200, width: 100, height: 20 }) as DOMRect;

    fireEvent.mouseEnter(cell);

    const portal = screen.getByTestId("findings-preview-portal");
    expect(portal.style.bottom).not.toBe("");
    expect(portal.style.top).toBe("");
  });
});
