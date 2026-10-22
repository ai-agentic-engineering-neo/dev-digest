/** SeverityCounts — per-severity counters, filter toggles and the hover popover. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounts } from "./SeverityCounts";
import { countBySeverity, findingsForPopover } from "./helpers";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop calls findMany once per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS = [
  finding({ id: "c1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "c2", severity: "CRITICAL", title: "Lethal trifecta" }),
  finding({ id: "w1", severity: "WARNING", title: "N+1 query" }),
  finding({ id: "s1", severity: "SUGGESTION", title: "Magic number" }),
  finding({ id: "d1", severity: "CRITICAL", title: "Dismissed one", dismissed_at: "2026-10-01T00:00:00Z" }),
];

function renderIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("severity helpers", () => {
  it("counts non-dismissed findings per severity", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("popover list is most-severe-first and can be scoped to one level", () => {
    expect(findingsForPopover(FINDINGS, null).map((f) => f.id)).toEqual(["c1", "c2", "w1", "s1"]);
    expect(findingsForPopover(FINDINGS, "WARNING").map((f) => f.id)).toEqual(["w1"]);
  });
});

describe("SeverityCounts", () => {
  it("renders nothing when every count is zero", () => {
    const { container } = renderIntl(<SeverityCounts counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("full variant: '2 CRITICAL · 1 WARNING · 1 SUGGESTION' as toggle buttons", () => {
    const onSelect = vi.fn();
    renderIntl(
      <SeverityCounts variant="full" counts={countBySeverity(FINDINGS)} active="WARNING" onSelect={onSelect} />,
    );
    const crit = screen.getByRole("button", { name: "Show only Critical findings (2)" });
    expect(crit).toHaveTextContent("2Critical");
    expect(crit).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Warning/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(crit);
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("full variant: hovering a level shows only that level's findings", () => {
    renderIntl(<SeverityCounts variant="full" counts={countBySeverity(FINDINGS)} findings={FINDINGS} onSelect={() => {}} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Critical/ }));
    const pop = screen.getByRole("tooltip");
    expect(pop).toHaveTextContent("2 findings");
    expect(pop).toHaveTextContent("Hardcoded secret");
    expect(pop).not.toHaveTextContent("N+1 query");
    expect(pop).not.toHaveTextContent("Dismissed one");
  });

  it("compact variant: hovering shows every finding; Escape closes", () => {
    renderIntl(<SeverityCounts counts={countBySeverity(FINDINGS)} findings={FINDINGS} />);
    fireEvent.mouseEnter(screen.getByLabelText("1 Suggestion findings"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("4 findings");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
