import { describe, expect, it } from "vitest";
import { POPOVER_WIDTH, VIEWPORT_MARGIN } from "./constants";
import { popoverAnchor } from "./helpers";

const viewport = { width: 1200, height: 800 };

describe("popoverAnchor", () => {
  it("opens below the cell when there is room", () => {
    expect(popoverAnchor({ left: 100, top: 100, bottom: 120 }, viewport)).toEqual({ left: 100, top: 120 });
  });

  it("opens above the cell near the bottom of the viewport", () => {
    expect(popoverAnchor({ left: 100, top: 700, bottom: 720 }, viewport)).toEqual({ left: 100, bottom: 100 });
  });

  it("clamps the left edge inside the viewport", () => {
    const anchor = popoverAnchor({ left: 1150, top: 100, bottom: 120 }, viewport);
    expect(anchor.left).toBe(viewport.width - POPOVER_WIDTH - VIEWPORT_MARGIN);
  });
});
