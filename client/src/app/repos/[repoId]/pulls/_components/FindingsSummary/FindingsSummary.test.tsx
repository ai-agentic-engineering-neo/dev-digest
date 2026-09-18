import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Finding } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsSummary } from "./FindingsSummary";

afterEach(cleanup);

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A **live** secret is committed in source, visible to anyone with repo access.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    ...overrides,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsSummary", () => {
  it("renders a dash when the PR has no findings", () => {
    renderWithIntl(<FindingsSummary findings={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows only the severities actually present, no popover before hover", () => {
    const findings = [finding({ id: "f1", severity: "CRITICAL" }), finding({ id: "f2", severity: "CRITICAL" })];
    renderWithIntl(<FindingsSummary findings={findings} />);
    expect(screen.getByText("2")).toBeInTheDocument(); // CRITICAL count
    expect(screen.queryByText(/FINDING/)).not.toBeInTheDocument(); // popover closed
  });

  it("hovering opens a read-only popover titled 'N FINDINGS IN THIS RUN' with no action buttons", () => {
    const findings = [
      finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
      finding({ id: "f2", severity: "WARNING", title: "Missing validation" }),
    ];
    const { container } = renderWithIntl(<FindingsSummary findings={findings} />);
    const wrap = container.firstElementChild!;

    fireEvent.mouseEnter(wrap);
    expect(screen.getByText("2 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Missing validation")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    fireEvent.mouseLeave(wrap);
    expect(screen.queryByText("2 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });

  it("preview shows category, file:line and confidence as plain text", () => {
    const findings = [finding({ file: "src/api/auth.ts", start_line: 40, end_line: 44, confidence: 0.9 })];
    const { container } = renderWithIntl(<FindingsSummary findings={findings} />);
    fireEvent.mouseEnter(container.firstElementChild!);
    expect(screen.getByText("src/api/auth.ts:40-44")).toBeInTheDocument();
    expect(screen.getByText("90% conf")).toBeInTheDocument();
  });
});
