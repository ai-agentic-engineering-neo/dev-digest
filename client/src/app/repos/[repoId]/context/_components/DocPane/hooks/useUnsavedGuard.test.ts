import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedGuard } from "./useUnsavedGuard";

const MSG = "Discard unsaved changes?";

afterEach(() => {
  vi.restoreAllMocks();
});

function popBack() {
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
}

describe("useUnsavedGuard — browser Back", () => {
  it("while dirty, Back asks first; cancel keeps the user on the page (guard re-pushed)", () => {
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true, MSG));
    expect(push).toHaveBeenCalledTimes(1); // guard entry

    // jsdom doesn't really move through history: simulate leaving the guard entry.
    window.history.replaceState(null, "", window.location.href);
    popBack();

    expect(confirm).toHaveBeenCalledWith(MSG);
    expect(back).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(2); // guard re-pushed: still on the page
  });

  it("while dirty, confirming Back leaves the page", () => {
    vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHook(() => useUnsavedGuard(true, MSG));

    window.history.replaceState(null, "", window.location.href);
    popBack();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not stack guard entries when the effect re-runs, and adds none when clean", () => {
    window.history.replaceState(null, "", window.location.href);
    const push = vi.spyOn(window.history, "pushState");
    const { rerender } = renderHook(({ msg }) => useUnsavedGuard(true, msg), { initialProps: { msg: MSG } });
    rerender({ msg: "Other text" });
    expect(push).toHaveBeenCalledTimes(1);

    push.mockClear();
    const confirm = vi.spyOn(window, "confirm");
    renderHook(() => useUnsavedGuard(false, MSG));
    expect(push).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
