import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, shouldIgnoreShortcut, visibleFindings } from "./helpers";

function finding(id: string, severity: FindingRecord["severity"], confidence: number): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: `finding ${id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS = [
  finding("w-high", "WARNING", 0.9),
  finding("c-high", "CRITICAL", 0.95),
  finding("w-low", "WARNING", 0.4),
];

describe("countBySeverity", () => {
  it("counts each level and reports 0 for a level with no findings", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });
});

describe("visibleFindings", () => {
  it("keeps only the chosen severity", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: false, severity: "WARNING" });
    expect(shown.map((f) => f.id)).toEqual(["w-high", "w-low"]);
  });

  it("applies the severity filter together with hide-low-confidence", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: true, severity: "WARNING" });
    expect(shown.map((f) => f.id)).toEqual(["w-high"]);
  });

  it("returns every finding, most severe first, when no filter is set", () => {
    const shown = visibleFindings(FINDINGS, { hideLow: false, severity: null });
    expect(shown.map((f) => f.id)).toEqual(["c-high", "w-high", "w-low"]);
  });
});

describe("shouldIgnoreShortcut", () => {
  const key = (init: KeyboardEventInit, target?: EventTarget) => {
    const e = new KeyboardEvent("keydown", { key: "a", ...init });
    if (target) Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("lets a plain key through", () => {
    expect(shouldIgnoreShortcut(key({}))).toBe(false);
  });

  it("ignores modifiers and key repeat", () => {
    expect(shouldIgnoreShortcut(key({ metaKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(key({ altKey: true }))).toBe(true);
    expect(shouldIgnoreShortcut(key({ repeat: true }))).toBe(true);
  });

  it("ignores a text input target", () => {
    expect(shouldIgnoreShortcut(key({}, document.createElement("textarea")))).toBe(true);
  });

  it("ignores keys while a dialog is open", () => {
    const d = document.body.appendChild(document.createElement("div"));
    d.setAttribute("role", "dialog");
    expect(shouldIgnoreShortcut(key({}))).toBe(true);
    d.remove();
  });

  it("ignores the key right after `g`, but not once the chord has timed out", () => {
    expect(shouldIgnoreShortcut(key({}), 1000, 1500)).toBe(true);
    expect(shouldIgnoreShortcut(key({}), 1000, 1000 + 5000)).toBe(false);
  });
});
