import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
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

  it("keeps the heading in place while the entries scroll under it (AC-22)", () => {
    const many: FindingPreviewItem[] = Array.from({ length: 12 }, (_, i) => ({
      ...ITEMS[0]!,
      title: `Finding ${i}`,
      line: i,
    }));
    render(<FindingPreviewPanel heading="12 FINDINGS" items={many} />);

    const list = screen.getByTestId("finding-preview-list");
    expect(list.style.overflowY).toBe("auto");
    expect(list).not.toContainElement(screen.getByText("12 FINDINGS"));

    fireEvent.scroll(list, { target: { scrollTop: 400 } });

    expect(screen.getByText("12 FINDINGS")).toBeInTheDocument();
  });

  it("names the dialog by its visible heading rather than repeating it", () => {
    render(<FindingPreviewPanel heading="3 FINDINGS" items={ITEMS} />);
    const panel = screen.getByRole("dialog", { name: "3 FINDINGS" });
    expect(panel).not.toHaveAttribute("aria-label");
    expect(panel.getAttribute("aria-labelledby")).toBe(screen.getByText("3 FINDINGS").id);
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
