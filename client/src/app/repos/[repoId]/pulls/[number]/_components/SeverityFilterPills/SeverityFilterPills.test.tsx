import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilterPills } from "./SeverityFilterPills";

afterEach(cleanup);

function renderPills(active: "CRITICAL" | "WARNING" | "SUGGESTION" | null, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilterPills
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        active={active}
        onChange={onChange}
      />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("SeverityFilterPills", () => {
  it("shows only severities that are present", () => {
    renderPills(null);
    expect(screen.getByRole("button", { name: "2 Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 Warning" })).toBeInTheDocument();
    expect(screen.queryByText(/Suggestion/)).not.toBeInTheDocument();
  });

  it("selects a severity, and clears it when the active pill is clicked", () => {
    const onChange = renderPills(null);
    fireEvent.click(screen.getByRole("button", { name: "1 Warning" }));
    expect(onChange).toHaveBeenLastCalledWith("WARNING");
    cleanup();
    const onChange2 = renderPills("WARNING");
    const active = screen.getByRole("button", { name: "1 Warning" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(active);
    expect(onChange2).toHaveBeenLastCalledWith(null);
  });
});
