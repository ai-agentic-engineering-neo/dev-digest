import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

function renderPills(counts: Record<Severity, number>, active: Severity | null, onToggle = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityPills counts={counts} active={active} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityPills", () => {
  it("renders only non-zero severities in CRITICAL · WARNING · SUGGESTION order", () => {
    const { container } = renderPills({ CRITICAL: 1, WARNING: 0, SUGGESTION: 4 }, null);
    const pills = [...container.querySelectorAll("button")];
    expect(pills.map((b) => b.dataset.severity)).toEqual(["CRITICAL", "SUGGESTION"]);
    expect(pills.map((b) => b.textContent)).toEqual(["1 Critical", "4 Suggestion"]);
    expect(container).toHaveTextContent("·");
  });

  it("renders nothing when there are no findings", () => {
    const { container } = renderPills({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, null);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the active pill pressed and reports clicks", () => {
    const onToggle = vi.fn();
    const { container } = renderPills({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }, "WARNING", onToggle);
    const warning = container.querySelector('button[data-severity="WARNING"]')!;
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('button[data-severity="CRITICAL"]')).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(warning);
    expect(onToggle).toHaveBeenCalledWith("WARNING");
  });
});
