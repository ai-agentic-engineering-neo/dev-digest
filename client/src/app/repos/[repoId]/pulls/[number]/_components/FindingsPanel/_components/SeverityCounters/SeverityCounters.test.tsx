import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityCounters } from "./SeverityCounters";

afterEach(cleanup);

const LABELS = { group: "Filter findings by severity", showOnly: (s: string) => `Show only ${s} findings` };

describe("SeverityCounters", () => {
  it("renders one button per level with its count, inside a labelled group", () => {
    render(
      <SeverityCounters
        counts={{ CRITICAL: 3, WARNING: 5, SUGGESTION: 2 }}
        active={null}
        onSelect={() => {}}
        labels={LABELS}
      />,
    );
    expect(screen.getByRole("group", { name: "Filter findings by severity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show only CRITICAL findings (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show only WARNING findings (5)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show only SUGGESTION findings (2)" })).toBeInTheDocument();
  });

  it("selects a level, and clicking the active level again clears the filter", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SeverityCounters counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 }} active={null} onSelect={onSelect} labels={LABELS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /WARNING/ }));
    expect(onSelect).toHaveBeenLastCalledWith("WARNING");

    rerender(
      <SeverityCounters counts={{ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 }} active="WARNING" onSelect={onSelect} labels={LABELS} />,
    );
    const warning = screen.getByRole("button", { name: /WARNING/ });
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(warning);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("hides levels with zero findings", () => {
    render(
      <SeverityCounters counts={{ CRITICAL: 0, WARNING: 2, SUGGESTION: 0 }} active={null} onSelect={() => {}} labels={LABELS} />,
    );
    expect(screen.queryByRole("button", { name: /CRITICAL/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SUGGESTION/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WARNING/ })).toBeEnabled();
  });
});
