/**
 * SeverityCounts renders in two modes from one tally: static chips (PR list,
 * timeline) and buttons (findings panel). The invariants: zero counts never
 * render, and the static mode must NOT produce a button — the list's chips are
 * read-only by design, only the panel's counters filter anything.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SeverityCounts } from "./SeverityCounts";

afterEach(cleanup);

const COUNTS = { CRITICAL: 2, WARNING: 1, SUGGESTION: 3 };

describe("SeverityCounts (static)", () => {
  it("renders one chip per non-zero severity, in severity order", () => {
    const { container } = render(<SeverityCounts counts={COUNTS} />);
    expect(container.textContent).toBe("Critical2Warning1Suggestion3");
  });

  it("omits zero counts", () => {
    const { container } = render(<SeverityCounts counts={{ CRITICAL: 0, WARNING: 2 }} />);
    expect(container.textContent).toBe("Warning2");
  });

  it("compact drops the severity labels but keeps the numbers", () => {
    const { container } = render(<SeverityCounts counts={COUNTS} compact />);
    expect(container.textContent).toBe("213");
  });

  it("renders no buttons — the static chips are not interactive", () => {
    render(<SeverityCounts counts={COUNTS} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty or absent tally", () => {
    const { container: a } = render(<SeverityCounts counts={{}} />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<SeverityCounts counts={null} />);
    expect(b).toBeEmptyDOMElement();
  });
});

describe("SeverityCounts (interactive)", () => {
  it("becomes a labelled group of buttons when onSelect is given", () => {
    render(<SeverityCounts counts={COUNTS} onSelect={vi.fn()} label="Findings by severity" />);
    const group = screen.getByRole("group", { name: "Findings by severity" });
    expect(group.querySelectorAll("button")).toHaveLength(3);
  });

  it("fires onSelect with the clicked severity", () => {
    const onSelect = vi.fn();
    render(<SeverityCounts counts={COUNTS} onSelect={onSelect} titleFor={(sev) => `pick ${sev}`} />);
    fireEvent.click(screen.getByTitle("pick WARNING"));
    expect(onSelect).toHaveBeenCalledWith("WARNING");
  });

  it("aria-pressed tracks the active severity", () => {
    render(<SeverityCounts counts={COUNTS} active="CRITICAL" onSelect={vi.fn()} titleFor={(sev) => sev} />);
    expect(screen.getByTitle("CRITICAL")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("WARNING")).toHaveAttribute("aria-pressed", "false");
  });
});
