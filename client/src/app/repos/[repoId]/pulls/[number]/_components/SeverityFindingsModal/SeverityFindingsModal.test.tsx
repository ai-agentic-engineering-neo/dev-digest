import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFindingsModal } from "./SeverityFindingsModal";
import { MIXED } from "../FindingsPanel/fixtures.test-data";

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const onShowOnly = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFindingsModal
        severity="WARNING"
        findings={MIXED}
        agentName="Security Reviewer"
        onClose={onClose}
        onShowOnly={onShowOnly}
      />
    </NextIntlClientProvider>,
  );
  return { onClose, onShowOnly };
}

describe("SeverityFindingsModal", () => {
  it("lists only findings of the given severity with title and file:line", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("2 WARNING findings")).toBeInTheDocument();
    expect(within(dialog).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(dialog).getByText("Warning high conf")).toBeInTheDocument();
    expect(within(dialog).getByText("Warning low conf")).toBeInTheDocument();
    expect(within(dialog).getByText("src/w1.ts:10–12")).toBeInTheDocument();
    expect(within(dialog).queryByText("Critical one")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Suggestion one")).not.toBeInTheDocument();
  });

  it("closes via the Close button, the header X and Escape", () => {
    const { onClose } = setup();
    const closeButtons = screen.getAllByRole("button", { name: "Close" }); // header X + footer
    expect(closeButtons).toHaveLength(2);
    closeButtons.forEach((b) => fireEvent.click(b));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("'Show only these' applies the severity filter", () => {
    const { onShowOnly } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show only these" }));
    expect(onShowOnly).toHaveBeenCalledWith("WARNING");
  });
});
