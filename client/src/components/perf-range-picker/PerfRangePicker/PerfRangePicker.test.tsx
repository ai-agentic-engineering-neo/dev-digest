import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PerfRangeValue } from "@/lib/hooks/agent-performance";
import { PerfRangePicker } from "./PerfRangePicker";

afterEach(cleanup);

const LABELS: Record<string, string> = {
  label: "Range",
  "1": "1 day",
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  custom: "Custom",
  from: "From",
  to: "To",
  apply: "Apply",
};

// The real component takes a next-intl translator; a plain lookup function
// satisfies its actual call shape (`t(key)`) without pulling in the provider.
const t = ((key: string) => LABELS[key] ?? key) as unknown as Parameters<typeof PerfRangePicker>[0]["t"];

describe("PerfRangePicker", () => {
  it("switches presets (clarification #5) and reports the selected preset", () => {
    const onChange = vi.fn();
    render(<PerfRangePicker value={{ days: 30 }} onChange={onChange} t={t} />);

    expect(screen.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));
    expect(onChange).toHaveBeenCalledWith({ days: 7 });
  });

  it("opens the custom range and applies a from/to pair as an ISO datetime range", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PerfRangePicker value={{ days: 30 }} onChange={onChange} t={t} />);

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    // Apply is disabled until both dates are filled — no partial range fires.
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0]![0] as PerfRangeValue;
    expect("from" in range && "to" in range).toBe(true);
    if ("from" in range) {
      expect(range.from.startsWith("2026-08-01")).toBe(true);
      expect(range.to.startsWith("2026-08-31")).toBe(true);
    }

    // A custom value passed back in re-selects Custom and pre-fills the dates.
    rerender(<PerfRangePicker value={range} onChange={onChange} t={t} />);
    expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
  });
});
