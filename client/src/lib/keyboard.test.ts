import { describe, it, expect } from "vitest";
import { isInteractiveTarget } from "./keyboard";

describe("isInteractiveTarget", () => {
  it("is true inside a link or button, false on plain content", () => {
    document.body.innerHTML = `<div id="plain"><a href="/x"><span id="in-link"></span></a><button><i id="in-btn"></i></button></div>`;
    expect(isInteractiveTarget(document.getElementById("in-link"))).toBe(true);
    expect(isInteractiveTarget(document.getElementById("in-btn"))).toBe(true);
    expect(isInteractiveTarget(document.getElementById("plain"))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});
