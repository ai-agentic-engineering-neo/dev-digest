import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// React Flow (graph-canvas) needs DOMMatrixReadOnly and non-zero element sizes in jsdom.
if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  globalThis.DOMMatrixReadOnly = class {
    m22 = 1;
    constructor(transform?: string) {
      const scale = typeof transform === "string" ? /scale\(([\d.]+)\)/.exec(transform) : null;
      if (scale) this.m22 = Number(scale[1]);
    }
  } as unknown as typeof DOMMatrixReadOnly;
}
if (typeof HTMLElement !== "undefined") {
  const define = (name: "offsetWidth" | "offsetHeight", value: number) => {
    if (Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)?.get?.call(document.body) === 0) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
    }
  };
  define("offsetWidth", 800);
  define("offsetHeight", 600);
}
