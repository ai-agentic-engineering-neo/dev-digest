import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, vi } from "vitest";

// CodeMirror measures layout that jsdom does not have (typing into it is not
// possible from user-event), so tests get a textarea with the same
// value/onChange contract. The rest of the module (EditorView, …) stays real.
vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uiw/react-codemirror")>();
  function CodeMirrorStub(props: { value?: string; onChange?: (v: string) => void; "aria-label"?: string }) {
    return React.createElement("textarea", {
      "aria-label": props["aria-label"],
      value: props.value ?? "",
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => props.onChange?.(e.target.value),
    });
  }
  return { ...actual, default: CodeMirrorStub };
});

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
