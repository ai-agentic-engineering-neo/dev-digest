import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";

import { SeverityCounters } from "./SeverityCounters";

afterEach(cleanup);

function finding(severity: FindingRecord["severity"], id: string): FindingRecord {
  return {
    id,
    severity,
    category: "security",
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

describe("SeverityCounters", () => {
  it("renders per-severity counts in severity order", () => {
    render(<SeverityCounters findings={FINDINGS} active={null} onChange={vi.fn()} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders nothing when there are no findings", () => {
    const { container } = render(<SeverityCounters findings={[]} active={null} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onChange with the clicked severity, and null on a repeat click", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SeverityCounters findings={FINDINGS} active={null} onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Critical"));
    expect(onChange).toHaveBeenLastCalledWith("CRITICAL");

    rerender(<SeverityCounters findings={FINDINGS} active="CRITICAL" onChange={onChange} />);
    fireEvent.click(screen.getByText("Critical"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
