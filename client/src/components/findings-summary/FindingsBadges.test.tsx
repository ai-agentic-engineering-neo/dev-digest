import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingsSummary } from "@devdigest/shared";
import common from "../../../messages/en/common.json";
import { FindingsBadges } from "./FindingsBadges";

afterEach(cleanup);

const SUMMARY: FindingsSummary = {
  counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 2 },
  items: [
    { id: "c", severity: "CRITICAL", category: "security", title: "Hardcoded secret", file: "src/config.ts", start_line: 11, end_line: 11, confidence: 0.95, rationale: "A live key is committed." },
    { id: "s1", severity: "SUGGESTION", category: "style", title: "Rename var", file: "src/a.ts", start_line: 4, end_line: 6, confidence: 0.6, rationale: "Clearer name." },
    { id: "s2", severity: "SUGGESTION", category: "test", title: "Add test", file: "src/b.ts", start_line: 1, end_line: 1, confidence: 0.5, rationale: "Uncovered branch." },
  ],
};

function renderBadges(summary: FindingsSummary | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <FindingsBadges summary={summary} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsBadges", () => {
  it("renders one badge per non-zero severity with its count", () => {
    const { container } = renderBadges(SUMMARY);
    expect(container.querySelector('[data-severity="CRITICAL"]')?.textContent).toBe("1");
    expect(container.querySelector('[data-severity="WARNING"]')).toBeNull();
    expect(container.querySelector('[data-severity="SUGGESTION"]')?.textContent).toBe("2");
    expect(screen.getByLabelText("3 findings")).toBeInTheDocument();
  });

  it("renders — when there is no review or no findings", () => {
    expect(renderBadges(null).container.textContent).toBe("—");
    cleanup();
    const empty = { counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, items: [] };
    expect(renderBadges(empty).container.textContent).toBe("—");
  });

  it("hover opens a tooltip listing every finding; leaving closes it", async () => {
    renderBadges(SUMMARY);
    const trigger = screen.getByLabelText("3 findings");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("3 findings in this run");
    expect(tooltip).toHaveTextContent("Hardcoded secret");
    expect(tooltip).toHaveTextContent("src/config.ts:11");
    expect(tooltip).toHaveTextContent("src/a.ts:4-6");
    expect(tooltip).toHaveTextContent("A live key is committed.");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.mouseLeave(trigger);
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderBadges(SUMMARY);
    const trigger = screen.getByLabelText("3 findings");
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("clicks inside the tooltip do not reach the host row", () => {
    let rowClicks = 0;
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <div onClick={() => rowClicks++}>
          <FindingsBadges summary={SUMMARY} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.mouseEnter(screen.getByLabelText("3 findings"));
    fireEvent.click(screen.getByRole("tooltip"));
    expect(rowClicks).toBe(0);
  });
});
