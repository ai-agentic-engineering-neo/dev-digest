/**
 * FindingPreview — the READ-ONLY finding rendering shared by the PR list's
 * hover popover and the run-trace drawer.
 *
 * Two regression guards here are the whole point of the component:
 *  - it renders nothing interactive (the popover must not offer accept/dismiss);
 *  - it needs no i18n provider, so both host surfaces can render it without
 *    widening their message namespaces.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingPreview, type FindingPreviewData } from "./FindingPreview";

const finding = (o: Partial<FindingPreviewData> = {}): FindingPreviewData => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  confidence: 0.95,
  description: "A live secret is committed in plain text.",
  ...o,
});

describe("FindingPreview", () => {
  it("renders severity, title, category, file:line, confidence and description", () => {
    // Deliberately NO NextIntlClientProvider — the component must not need one.
    render(<FindingPreview finding={finding()} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
    expect(screen.getByText("95% conf")).toBeInTheDocument();
    expect(screen.getByText("A live secret is committed in plain text.")).toBeInTheDocument();
  });

  it("is read-only: renders no button, link or input", () => {
    render(<FindingPreview finding={finding()} />);
    for (const role of ["button", "link", "textbox", "combobox", "listbox"]) {
      expect(screen.queryByRole(role)).not.toBeInTheDocument();
    }
  });

  it("shows a line range only when the finding spans more than one line", () => {
    const { rerender } = render(<FindingPreview finding={finding({ start_line: 45, end_line: 52 })} />);
    expect(screen.getByText("src/config.ts:45-52")).toBeInTheDocument();
    // FindingRecord-shaped data may omit end_line entirely.
    rerender(<FindingPreview finding={finding({ start_line: 45, end_line: null })} />);
    expect(screen.getByText("src/config.ts:45")).toBeInTheDocument();
  });

  it("falls back to a neutral badge for an off-enum severity instead of crashing", () => {
    // `findings.severity` is free text in the DB, so the kit's SEV map can miss.
    render(<FindingPreview finding={finding({ severity: "WEIRD", category: "nonsense" })} />);
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.queryByText("nonsense")).not.toBeInTheDocument();
  });

  it("omits the description paragraph when there is none", () => {
    const withDescription = finding();
    render(<FindingPreview finding={{ ...withDescription, description: null }} />);
    expect(screen.getByText(withDescription.title)).toBeInTheDocument();
    expect(screen.queryByText(withDescription.description!)).not.toBeInTheDocument();
  });
});
