/**
 * CircularScore — `colorOverride` lets a caller pin the ring to a verdict /
 * run-outcome colour instead of the numeric thresholds. It is purely additive:
 * omitting it must leave today's threshold colouring byte-for-byte unchanged
 * (PRRow's PR-list Score column depends on that).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CircularScore } from "./CircularScore";

afterEach(cleanup);

/** The progress arc is the SECOND circle (the first is the muted track). */
function arcStroke(container: HTMLElement): string | null {
  return [...container.querySelectorAll("circle")][1]!.getAttribute("stroke");
}

describe("CircularScore — numeric thresholds (no colorOverride)", () => {
  it("renders the score number", () => {
    render(<CircularScore score={73} />);
    expect(screen.getByText("73")).toBeInTheDocument();
  });

  it(">= 75 is green", () => {
    const { container } = render(<CircularScore score={75} />);
    expect(arcStroke(container)).toBe("var(--ok)");
  });

  it("50–74 is amber", () => {
    const { container } = render(<CircularScore score={50} />);
    expect(arcStroke(container)).toBe("var(--warn)");
  });

  it("< 50 is red", () => {
    const { container } = render(<CircularScore score={49} />);
    expect(arcStroke(container)).toBe("var(--crit)");
  });
});

describe("CircularScore — colorOverride wins", () => {
  it("overrides a would-be-red low score", () => {
    const { container } = render(<CircularScore score={12} colorOverride="var(--ok)" />);
    expect(arcStroke(container)).toBe("var(--ok)");
  });

  it("overrides a would-be-green high score", () => {
    const { container } = render(<CircularScore score={98} colorOverride="var(--crit)" />);
    expect(arcStroke(container)).toBe("var(--crit)");
  });

  it("does not change the rendered number or the track circle", () => {
    const { container } = render(<CircularScore score={98} colorOverride="var(--crit)" />);
    expect(screen.getByText("98")).toBeInTheDocument();
    expect([...container.querySelectorAll("circle")][0]!.getAttribute("stroke")).toBe(
      "var(--bg-hover)",
    );
  });
});
