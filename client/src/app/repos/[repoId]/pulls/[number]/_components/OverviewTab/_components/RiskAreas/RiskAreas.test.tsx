import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import type { BriefRisk } from "@/lib/types";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS: BriefRisk[] = [
  {
    kind: "security",
    title: "Auth bypass",
    explanation: "<img src=x onerror=alert(1)> **bold**",
    severity: "high",
    file_refs: ["src/a.ts:38-50", "src/b.ts", "lib/c.ts"],
    refs: [
      { ref: "src/a.ts:38-50", path: "src/a.ts", start_line: 38, end_line: 50, in_diff: true },
      { ref: "src/b.ts", path: "src/b.ts", start_line: null, end_line: null, in_diff: true },
      { ref: "lib/c.ts", path: "lib/c.ts", start_line: null, end_line: null, in_diff: false },
    ],
  },
  {
    kind: "unknown_kind",
    title: "Slow path",
    explanation: "",
    severity: "medium",
    file_refs: ["src/d.ts:3"],
    refs: [{ ref: "src/d.ts:3", path: "src/d.ts", start_line: 3, end_line: 3, in_diff: true }],
  },
];

function renderRisks(risks: BriefRisk[], onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} repoFullName="acme/app" linkSha="idx1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("RiskAreas", () => {
  it("renders collapsed cards, expands independently and routes line targets", () => {
    const onOpenFile = renderRisks(RISKS);
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getAllByText(/^\+\d+ more$/)).toHaveLength(1);
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show details: Auth bypass" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(onOpenFile).not.toHaveBeenCalled();
    const open = screen.getByRole("button", { name: "Hide details: Auth bypass" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("<img src=x onerror=alert(1)> **bold**")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open lib/c.ts on GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details: Slow path" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts:38 in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/a.ts", { start: 38, end: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Open src/b.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/b.ts", null);

    fireEvent.click(screen.getByText("Slow path"));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/d.ts", { start: 3, end: 3 });

    fireEvent.click(open);
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument();
  });

  it("styles the heading, cards, severity colours and kind icons", () => {
    renderRisks([
      ...RISKS,
      { kind: "perf", title: "Minor perf", explanation: "", severity: "low", file_refs: [], refs: [] },
    ]);
    // The heading's visible label (inner span) carries the uppercase transform.
    expect(within(screen.getByRole("heading", { name: "Risk areas" })).getByText("Risk areas")).toHaveStyle({
      textTransform: "uppercase",
    });

    const [security, unknown, perf] = screen.getAllByRole("listitem");
    for (const card of [security, unknown, perf]) {
      expect(card).toHaveStyle({ border: "1px solid var(--border)" });
    }

    const iconOf = (card: HTMLElement) => card.querySelector("svg") as SVGElement;
    expect(iconOf(security!)).toHaveStyle({ color: "var(--crit)" });
    expect(iconOf(unknown!)).toHaveStyle({ color: "var(--warn)" });
    expect(iconOf(perf!)).toHaveStyle({ color: "var(--info)" });

    // Unknown kind falls back to AlertTriangle (same glyph as the section label icon); known kinds do not.
    const fallbackClass = screen.getByRole("heading", { name: "Risk areas" }).querySelector("svg")?.getAttribute("class");
    expect(fallbackClass).toBeTruthy();
    expect(iconOf(unknown!).getAttribute("class")).toBe(fallbackClass);
    expect(iconOf(security!).getAttribute("class")).not.toBe(fallbackClass);
    expect(iconOf(perf!).getAttribute("class")).not.toBe(fallbackClass);
  });

  it("expands a risk without explanation to only its refs", () => {
    renderRisks(RISKS);
    const toggle = screen.getByRole("button", { name: "Show details: Slow path" });
    fireEvent.click(toggle);
    const details = document.getElementById(screen.getByRole("button", { name: "Hide details: Slow path" }).getAttribute("aria-controls") ?? "");
    expect(details).not.toBeNull();
    expect(details?.querySelector("p")).toBeNull();
    expect(details).toHaveTextContent(/^src\/d\.ts:3$/);
    expect(within(details as HTMLElement).getByRole("button", { name: "Open src/d.ts:3 in Files changed" })).toBeInTheDocument();
  });

  it("exposes the toggle as a focusable native button that expands and collapses", () => {
    renderRisks(RISKS);
    const toggle = screen.getByRole("button", { name: "Show details: Auth bypass" });
    // A native <button type="button"> is reachable by focus and handles Enter/Space itself.
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    toggle.focus();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // jsdom does not synthesize a click from Enter; browsers do, so emulate the activation.
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(toggle, { key: " " });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders a risk whose model-written kind is an Object.prototype key (no crash, fallback icon)", () => {
    const hostile: BriefRisk[] = ["constructor", "toString", "__proto__"].map((kind, i) => ({
      kind,
      title: `Hostile ${i}`,
      explanation: "",
      severity: "low",
      file_refs: ["src/x.ts"],
      refs: [{ ref: "src/x.ts", path: "src/x.ts", start_line: null, end_line: null, in_diff: true }],
    }));
    expect(() => renderRisks(hostile)).not.toThrow();
    for (const i of [0, 1, 2]) expect(screen.getByText(`Hostile ${i}`)).toBeInTheDocument();
  });

  it("shows the empty message", () => {
    renderRisks([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
