import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { FindingPreviewPanel, type FindingPreviewItem } from "./FindingPreviewPanel";

afterEach(cleanup);

const ITEMS: FindingPreviewItem[] = [
  {
    severity: "CRITICAL",
    title: "Hardcoded Stripe secret key in commit",
    category: "security",
    file: "src/config.ts",
    line: 12,
    confidence: 0.98,
    description: "Line 12 contains a literal string starting with sk_live_…",
  },
];

describe("FindingPreviewPanel", () => {
  it("shows the heading it was given", () => {
    render(<FindingPreviewPanel heading="3 FINDINGS" items={ITEMS} />);
    expect(screen.getByText("3 FINDINGS")).toBeInTheDocument();
  });

  it("shows all six fields of an entry (AC-23)", () => {
    render(<FindingPreviewPanel heading="3 FINDINGS" items={ITEMS} />);
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    expect(screen.getByText(/sk_live_/)).toBeInTheDocument();
  });

  it("renders no actionable control (AC-23)", () => {
    render(<FindingPreviewPanel heading="3 FINDINGS" items={ITEMS} />);
    const panel = screen.getByRole("dialog");
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).queryAllByRole("link")).toHaveLength(0);
  });

  it("renders finding text literally, never as markup (AC-27)", () => {
    const hostile: FindingPreviewItem[] = [{ ...ITEMS[0]!, title: "<img src=x onerror=alert(1)>" }];
    render(<FindingPreviewPanel heading="1 FINDING" items={hostile} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });

  it("lists every entry it is given, rather than a capped sample", () => {
    const many: FindingPreviewItem[] = Array.from({ length: 12 }, (_, i) => ({
      ...ITEMS[0]!,
      title: `Finding ${i}`,
      line: i,
    }));
    render(<FindingPreviewPanel heading="12 FINDINGS" items={many} />);
    expect(screen.getByText("Finding 0")).toBeInTheDocument();
    expect(screen.getByText("Finding 11")).toBeInTheDocument();
  });
});
