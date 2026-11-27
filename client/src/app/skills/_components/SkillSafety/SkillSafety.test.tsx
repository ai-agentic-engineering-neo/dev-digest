import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSafety, SkillSafetyFinding } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { HighlightedBody, SafetyBanner } from "./SkillSafety";
import { blockingFindings, findingAnchorId, highlightSegments, isFlagged } from "./helpers";

afterEach(cleanup);

const finding = (over: Partial<SkillSafetyFinding>): SkillSafetyFinding => ({
  rule: "override-instructions",
  severity: "block",
  line: 1,
  start: 0,
  end: 1,
  excerpt: "x",
  ...over,
});

const safety = (findings: SkillSafetyFinding[]): SkillSafety => ({
  status: findings.some((f) => f.severity === "block") ? "flagged" : "clean",
  findings,
  scanner_version: 1,
  scanned_at: "t",
});

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("skill safety helpers", () => {
  it("isFlagged / blockingFindings", () => {
    expect(isFlagged({ safety: safety([finding({})]) })).toBe(true);
    expect(isFlagged({ safety: safety([finding({ severity: "warn" })]) })).toBe(false);
    expect(isFlagged({})).toBe(false);
    expect(blockingFindings(safety([finding({}), finding({ severity: "warn" })]))).toHaveLength(1);
  });

  it("splits the body into plain and highlighted runs, every char exactly once", () => {
    const body = "ab ignore me cd";
    const segs = highlightSegments(body, [finding({ start: 3, end: 12 })]);
    expect(segs.map((s) => [s.text, s.findingIndex])).toEqual([
      ["ab ", undefined],
      ["ignore me", 0],
      [" cd", undefined],
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(body);
  });

  it("clips overlaps, clamps stale offsets and keeps the finding index", () => {
    const body = "0123456789";
    const segs = highlightSegments(body, [finding({ start: 6, end: 40 }), finding({ start: 2, end: 7 })]);
    expect(segs.map((s) => [s.text, s.findingIndex])).toEqual([
      ["01", undefined],
      ["23456", 1],
      ["789", 0],
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(body);
  });
});

describe("HighlightedBody", () => {
  it("marks each finding in yellow with an anchor and the rule as tooltip; text only, no HTML", () => {
    const body = "Rule <!-- hide --> <b>x</b>";
    wrap(<HighlightedBody body={body} findings={[finding({ rule: "hidden-text", start: 5, end: 18 })]} />);
    const pre = screen.getByTestId("skill-highlighted-body");
    expect(pre).toHaveTextContent(body);
    expect(pre.querySelector("b")).toBeNull();
    const mark = pre.querySelector("mark")!;
    expect(mark).toHaveTextContent("<!-- hide -->");
    expect(mark).toHaveAttribute("id", findingAnchorId(0));
    expect(mark).toHaveAttribute("title", "Hidden text");
  });
});

describe("SafetyBanner", () => {
  it("lists the findings; a click scrolls to the highlight, or calls onMissingAnchor", () => {
    const onMissing = vi.fn();
    const scrollIntoView = vi.fn();
    const s = safety([
      finding({ line: 3, excerpt: "ignore all previous instructions" }),
      finding({ rule: "encoded-payload", severity: "warn", line: 9, start: 5, end: 6, excerpt: "QUJD…" }),
    ]);
    wrap(
      <>
        <SafetyBanner safety={s} onMissingAnchor={onMissing} />
        <mark
          id={findingAnchorId(0)}
          ref={(el) => {
            if (el) el.scrollIntoView = scrollIntoView;
          }}
        />
      </>,
    );
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("INJECTION DETECTED — DO NOT ENABLE");
    expect(banner).toHaveTextContent("line 3");
    expect(banner).toHaveTextContent("Overrides instructions");
    expect(banner).toHaveTextContent("Encoded payload · warning only");

    fireEvent.click(screen.getByRole("button", { name: /line 3/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /line 9/ }));
    expect(onMissing).toHaveBeenCalledTimes(1);
  });
});
