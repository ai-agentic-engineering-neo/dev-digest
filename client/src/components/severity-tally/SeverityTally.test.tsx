import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityTally } from "./SeverityTally";
import { countSeverities, nonZeroLevels } from "./helpers";

afterEach(cleanup);

describe("SeverityTally", () => {
  it("shows only levels with findings, most severe first", () => {
    render(<SeverityTally counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} />);
    const chips = screen.getAllByRole("img");
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual(["CRITICAL 2", "SUGGESTION 1"]);
    expect(screen.queryByLabelText(/WARNING/)).not.toBeInTheDocument();
  });

  it("renders nothing when every level is zero", () => {
    const { container } = render(<SeverityTally counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the caller's label for the accessible name", () => {
    render(<SeverityTally counts={{ WARNING: 3 }} label={(s, n) => `${n} ${s.toLowerCase()}`} />);
    expect(screen.getByRole("img", { name: "3 warning" })).toBeInTheDocument();
  });
});

describe("severity-tally helpers", () => {
  it("countSeverities tallies known levels and ignores unknown", () => {
    expect(countSeverities([{ severity: "CRITICAL" }, { severity: "WARNING" }, { severity: "WARNING" }, { severity: "INFO" }])).toEqual({
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: 0,
    });
  });

  it("nonZeroLevels keeps contract order", () => {
    expect(nonZeroLevels({ SUGGESTION: 1, CRITICAL: 1 })).toEqual(["CRITICAL", "SUGGESTION"]);
  });
});
