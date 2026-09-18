import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsBySeverityBadge } from "./FindingsBySeverityBadge";

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: Math.random().toString(36),
    severity: "WARNING",
    category: "style",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  } as FindingRecord;
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "c1", severity: "CRITICAL", title: "Critical one" }),
  finding({ id: "w1", severity: "WARNING", title: "Warning one" }),
];
const COUNTS = { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 };

describe("FindingsBySeverityBadge", () => {
  it("renders a muted dash and no popover wiring when all counts are zero", () => {
    render(<FindingsBySeverityBadge counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} findings={[]} />);
    expect(screen.getByTestId("findings-badge-empty")).toBeInTheDocument();
  });

  it("hovering the trigger opens a popover titled 'N FINDINGS IN THIS RUN' listing all findings", () => {
    const { container } = render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    expect(screen.getByText(/2 FINDINGS IN THIS RUN/)).toBeInTheDocument();
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Warning one")).toBeInTheDocument();
  });

  it("hovering a severity ICON previews only that severity (red → criticals, orange → warnings)", () => {
    const { container } = render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    const [criticalChip, warningChip] = screen.getAllByRole("button");
    fireEvent.mouseEnter(container.firstChild as Element);
    fireEvent.mouseEnter(criticalChip!);
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
    fireEvent.mouseEnter(warningChip!);
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    expect(screen.queryByText("Critical one")).not.toBeInTheDocument();
    // The title still states the run's total (homework criterion 20).
    expect(screen.getByText(/2 FINDINGS IN THIS RUN/)).toBeInTheDocument();
  });

  it("hover-then-click pins the hovered severity (first click never clears it)", () => {
    const { container } = render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    const [criticalChip, warningChip] = screen.getAllByRole("button");
    fireEvent.mouseEnter(container.firstChild as Element);
    fireEvent.mouseEnter(criticalChip!);
    fireEvent.click(criticalChip!);
    expect(criticalChip).toHaveAttribute("aria-pressed", "true");
    // Pinned: hovering another icon no longer changes the list.
    fireEvent.mouseEnter(warningChip!);
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
  });

  it("clicking a severity chip narrows the popover to that severity; clicking again clears it", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    // SEVERITY_ORDER is CRITICAL, WARNING, SUGGESTION — the first rendered chip is CRITICAL.
    const criticalChip = screen.getAllByRole("button")[0]!;
    fireEvent.click(criticalChip);
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
    fireEvent.click(criticalChip);
    expect(screen.getByText("Warning one")).toBeInTheDocument();
  });

  it("shows a loading state when findings is undefined (lazy fetch in flight)", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={undefined} />);
    fireEvent.mouseEnter(screen.getAllByRole("button")[0]!.parentElement!);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("pressing Escape closes an open, pinned popover", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    const criticalChip = screen.getAllByRole("button")[0]!;
    fireEvent.click(criticalChip); // pins it open
    expect(screen.getByText(/FINDINGS IN THIS RUN/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
  });

  it("never renders any accept/dismiss buttons in the popover", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(screen.queryByText(/accept/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dismiss/i)).not.toBeInTheDocument();
  });
});

/**
 * The SAME component is mounted at three call sites with three genuinely
 * different click contracts (see this component's header comment and
 * client/specs/README.md). These tests keep them apart explicitly — "has an
 * onSeverityClick" is NOT one uniform case.
 *
 * NOTE: none of this touches `FindingsPanel`'s `SeverityFilterPills`, a
 * separate widget with its own click-to-filter contract.
 */
describe("FindingsBySeverityBadge — per-call-site click contracts", () => {
  it("(A) PR list: onSeverityClick fires and the popover is NOT pinned/narrowed (the page is being left)", () => {
    const onSeverityClick = vi.fn();
    render(
      <FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} onSeverityClick={onSeverityClick} />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!); // CRITICAL chip
    expect(onSeverityClick).toHaveBeenCalledWith("CRITICAL");
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")[0]!).toHaveAttribute("aria-pressed", "false");
  });

  it("(B) Timeline: same as the PR list — navigate only, no local pin (pinOnClick omitted)", () => {
    const onSeverityClick = vi.fn();
    render(
      <FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} compact onSeverityClick={onSeverityClick} />,
    );
    fireEvent.click(screen.getAllByRole("button")[1]!); // WARNING chip
    expect(onSeverityClick).toHaveBeenCalledWith("WARNING");
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
  });

  it("(C) Accordion header: onSeverityClick fires AND the local popover still pins + narrows", () => {
    const onSeverityClick = vi.fn();
    render(
      <FindingsBySeverityBadge
        counts={COUNTS}
        findings={FINDINGS}
        compact
        pinOnClick
        onSeverityClick={onSeverityClick}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!); // CRITICAL chip
    expect(onSeverityClick).toHaveBeenCalledWith("CRITICAL");
    // Both fire: this is the one call site that stays on the page.
    expect(screen.getByText(/FINDINGS IN THIS RUN/)).toBeInTheDocument();
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
  });

  it("no onSeverityClick at all: today's pin + narrow behaviour is completely unchanged", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} />);
    const critical = screen.getAllByRole("button")[0]!;
    fireEvent.click(critical);
    expect(screen.getByText(/FINDINGS IN THIS RUN/)).toBeInTheDocument();
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
  });

  it("pinOnClick without onSeverityClick is a no-op — pin + narrow is already the behaviour", () => {
    render(<FindingsBySeverityBadge counts={COUNTS} findings={FINDINGS} pinOnClick />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(screen.getByText(/FINDINGS IN THIS RUN/)).toBeInTheDocument();
    expect(screen.queryByText("Warning one")).not.toBeInTheDocument();
  });
});
