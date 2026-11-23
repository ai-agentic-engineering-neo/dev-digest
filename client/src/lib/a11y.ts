import type { KeyboardEvent } from "react";

/**
 * Props that make a non-`<button>` element (a card or header that contains
 * nested buttons/links, so it can't itself be a <button>) keyboard-operable:
 * focusable, announced as a button, activated with Enter/Space.
 *
 * Key events bubbling up from nested controls are ignored, so Enter on an inner
 * button/link still does its own thing instead of also toggling the parent.
 * Returns `{}` when there is no handler, leaving the element non-interactive.
 */
export function buttonLikeProps(onActivate?: () => void) {
  if (!onActivate) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** `buttonLikeProps` + `aria-expanded`, for accordion / collapsible headers. */
export function disclosureProps(expanded: boolean, toggle: () => void) {
  return { ...buttonLikeProps(toggle), "aria-expanded": expanded };
}
