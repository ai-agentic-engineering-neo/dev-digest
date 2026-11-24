import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilter } from "./SeverityFilter";

afterEach(cleanup);

const COUNTS: Record<Severity, number> = { CRITICAL: 3, WARNING: 5, SUGGESTION: 0 };

function renderFilter(active: Severity | null, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilter counts={COUNTS} active={active} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("SeverityFilter", () => {
  it("renders one counter per level in contract order, including 0", () => {
    renderFilter(null);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    expect(group).toHaveTextContent("3 Critical·5 Warning·0 Suggestion");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "3 Critical",
      "5 Warning",
      "0 Suggestion",
    ]);
  });

  it("with no filter, every counter looks the same and none is pressed", () => {
    renderFilter(null);
    for (const b of screen.getAllByRole("button")) {
      expect(b).toHaveAttribute("aria-pressed", "false");
      expect(b).toHaveAttribute("data-state", "neutral");
    }
  });

  it("marks only the active level; the other two are muted", () => {
    renderFilter("WARNING");
    expect(screen.getByRole("button", { name: "5 Warning" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "5 Warning" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("button", { name: "3 Critical" })).toHaveAttribute("data-state", "muted");
    expect(screen.getByRole("button", { name: "0 Suggestion" })).toHaveAttribute("data-state", "muted");
  });

  it("clicking a level selects it; clicking another switches to it", () => {
    const onChange = renderFilter("CRITICAL");
    fireEvent.click(screen.getByRole("button", { name: "5 Warning" }));
    expect(onChange).toHaveBeenLastCalledWith("WARNING");
  });

  it("clicking the active level clears the filter", () => {
    const onChange = renderFilter("CRITICAL");
    fireEvent.click(screen.getByRole("button", { name: "3 Critical" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
