/**
 * `lineRowFor` / `findingMarkerStyle` — the muted "all findings dismissed"
 * treatment (a line stripe blended to 40% via `color-mix`, a label at 50%
 * opacity). Tested as pure functions rather than through the DOM: jsdom does
 * not resolve `color-mix()` computed styles, so a rendered assertion on the
 * stripe color would not reliably observe this (client/AGENTS.md — no new
 * DOM-observation dependency to work around it).
 */
import { describe, it, expect } from "vitest";
import { lineRowFor, findingMarkerStyle } from "./styles";

describe("lineRowFor", () => {
  it("applies the stripe color as-is when NOT muted", () => {
    const style = lineRowFor("ctx", "red", false);
    expect(style.borderLeftColor).toBe("red");
  });

  it("blends the stripe to 40% via color-mix when muted", () => {
    const style = lineRowFor("ctx", "red", true);
    expect(style.borderLeftColor).toBe("color-mix(in srgb, red 40%, transparent)");
  });

  it("falls back to a transparent border when there is no stripe color", () => {
    const style = lineRowFor("ctx");
    expect(style.borderLeftColor).toBe("transparent");
  });
});

describe("findingMarkerStyle", () => {
  it("is fully opaque when not muted", () => {
    expect(findingMarkerStyle("red", false).opacity).toBe(1);
  });

  it("is at 0.5 opacity when muted (all findings on the line are dismissed)", () => {
    expect(findingMarkerStyle("red", true).opacity).toBe(0.5);
  });
});
