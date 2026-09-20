import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SeverityCounters, countBySeverity } from "./SeverityCounters";

afterEach(cleanup);

function finding(severity: Severity, id: string): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [
  finding("CRITICAL", "f1"),
  finding("CRITICAL", "f2"),
  finding("CRITICAL", "f3"),
  finding("WARNING", "f4"),
  finding("WARNING", "f5"),
  finding("SUGGESTION", "f6"),
];

describe("countBySeverity", () => {
  it("counts each severity, defaulting missing ones to 0", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 3, WARNING: 2, SUGGESTION: 1 });
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("SeverityCounters", () => {
  it("renders nothing when there are no findings", () => {
    const { container } = render(
      <SeverityCounters findings={[]} active={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a count chip per severity", () => {
    render(<SeverityCounters findings={FINDINGS} active={null} onSelect={vi.fn()} />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("SUGGESTION")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("selects a severity on click", () => {
    const onSelect = vi.fn();
    render(<SeverityCounters findings={FINDINGS} active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("CRITICAL"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clears the filter when clicking the already-active severity", () => {
    const onSelect = vi.fn();
    render(<SeverityCounters findings={FINDINGS} active="CRITICAL" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("CRITICAL"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
