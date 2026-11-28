/* Keyboard-shortcut rules shared by the app shell and the findings panel. */

/** Window (ms) to press the second key of a `g`-then-key navigation chord. */
export const G_NAV_TIMEOUT_MS = 1200;

/** Whether an event target is a text-entry element (guards typing-aware shortcuts). */
export function isTextInput(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return (
    !!node &&
    (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
  );
}

const INTERACTIVE = "a[href], button, input, select, textarea, label, [role='switch'], [role='button']";

/**
 * Whether a click landed on a control inside a clickable card or row. The
 * whole-card click is a mouse convenience; real controls (the title link,
 * buttons, toggles) keep their own behaviour and must not also trigger it.
 */
export function isInteractiveTarget(el: EventTarget | null): boolean {
  return el instanceof Element && el.closest(INTERACTIVE) !== null;
}
