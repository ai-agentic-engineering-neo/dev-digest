"use client";

import React from "react";

/** Whether an event target is a text-entry element (guards typing-aware shortcuts). */
export function isTextInput(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return (
    !!node &&
    (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
  );
}

/** Window-level `keydown` listener. One listener for the component's lifetime:
   the latest `handler` is read through a ref, so callers need not memoize it.
   `ignoreInputs` drops events whose target is a text field (INPUT, TEXTAREA,
   contentEditable) — for bare-key shortcuts that must not fire while typing. */
export function useKeydown(
  handler: (e: KeyboardEvent) => void,
  { ignoreInputs = false }: { ignoreInputs?: boolean } = {},
): void {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreInputs && isTextInput(e.target)) return;
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ignoreInputs]);
}
