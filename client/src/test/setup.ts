import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Tests stub globals (fetch, EventSource) per test; never leak them.
afterEach(() => {
  vi.unstubAllGlobals();
});
