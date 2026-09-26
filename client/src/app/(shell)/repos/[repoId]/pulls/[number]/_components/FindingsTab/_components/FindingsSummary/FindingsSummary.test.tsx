import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";
import { FindingsSummary } from "./FindingsSummary";

afterEach(cleanup);

const f = (id: string, severity: string): FindingRecord =>
  ({
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  }) as FindingRecord;

const FINDINGS = [f("a", "CRITICAL"), f("b", "CRITICAL"), f("c", "WARNING")];

function renderSummary(props: Partial<React.ComponentProps<typeof FindingsSummary>> = {}) {
  const onSeverityChange = props.onSeverityChange ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsSummary
        findings={props.findings ?? FINDINGS}
        severityFilter={props.severityFilter ?? null}
        onSeverityChange={onSeverityChange}
      />
    </NextIntlClientProvider>,
  );
  return onSeverityChange;
}

describe("FindingsSummary", () => {
  it("counts each severity over every run and omits the empty buckets", () => {
    renderSummary();
    expect(screen.getByLabelText("Show only CRITICAL findings")).toHaveTextContent("2");
    expect(screen.getByLabelText("Show only WARNING findings")).toHaveTextContent("1");
    expect(screen.queryByLabelText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("asks the page to filter by the severity that was clicked", () => {
    const onSeverityChange = renderSummary();
    fireEvent.click(screen.getByLabelText("Show only CRITICAL findings"));
    expect(onSeverityChange).toHaveBeenCalledWith("CRITICAL");
  });

  it("clears the filter when the active counter is clicked again", () => {
    const onSeverityChange = renderSummary({ severityFilter: "CRITICAL" });
    const active = screen.getByLabelText("Show findings of every severity");
    expect(active).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(active);
    expect(onSeverityChange).toHaveBeenCalledWith(null);
  });

  it("keeps showing the FULL counts while a filter is on", () => {
    // The counters are a summary of the PR, not of what survived the filter —
    // otherwise clicking one would make the other numbers vanish.
    renderSummary({ severityFilter: "CRITICAL" });
    expect(screen.getByLabelText("Show only WARNING findings")).toHaveTextContent("1");
  });

  it("renders nothing at all for a PR with no findings", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsSummary findings={[]} severityFilter={null} onSeverityChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
