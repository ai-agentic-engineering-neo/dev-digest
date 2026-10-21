import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiffDeepLink } from "./useDiffDeepLink";

function mountCard(path: string, line?: number) {
  const card = document.createElement("div");
  card.dataset.diffPath = path;
  card.scrollIntoView = vi.fn();
  document.body.append(card);
  let lineEl: HTMLElement | null = null;
  if (line != null) {
    lineEl = document.createElement("div");
    lineEl.dataset.line = String(line);
    lineEl.scrollIntoView = vi.fn();
    card.append(lineEl);
  }
  return { card, lineEl };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useDiffDeepLink", () => {
  // Regression: the deep link must scroll to the line, highlight it, and let the highlight go after 2 s.
  it("scrolls to the line, highlights it for 2 s, then clears", async () => {
    const { lineEl } = mountCard("a.ts", 12);
    const { result } = renderHook(() => useDiffDeepLink({ path: "a.ts", line: 12 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(lineEl!.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(result.current).toBe(false);
  });

  // Regression: a link without a line scrolls to the file card and never highlights.
  it("scrolls to the file card only when there is no line", async () => {
    const { card } = mountCard("a.ts");
    const { result } = renderHook(() => useDiffDeepLink({ path: "a.ts", line: null }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(card.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  // Regression: a path that is not rendered must be a silent no-op, not a throw or a highlight.
  it("does nothing when the file is not rendered", async () => {
    const { result } = renderHook(() => useDiffDeepLink({ path: "missing.ts", line: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current).toBe(false);
  });
});
