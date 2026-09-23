"use client";

import React from "react";

/** Grace period between leaving the anchor and the popover actually closing —
 *  long enough to move the cursor across the small visual gap between them
 *  (and to reach the popover's own scrollbar) without a flicker-close. */
const CLOSE_DELAY_MS = 150;

/**
 * Shared hover/focus + anchor-rect logic for every `FindingsPopover` caller
 * (the PR-list FINDINGS cell, a Timeline run tile). The rect is recomputed
 * fresh on each open — rows re-sort/re-filter, so a stale rect from mount
 * time would drift — and the popover closes on scroll rather than tracking
 * position continuously while open (simpler, and good enough for a hover
 * preview).
 *
 * The popover is portaled to `document.body` (see FindingsPopover.tsx), so
 * it's NOT a DOM descendant of the anchor — moving the mouse from the anchor
 * onto the popover is a real `mouseleave` on the anchor at the browser level.
 * Closing immediately on that would make the popover impossible to hover
 * into (can't scroll a menu that vanishes the instant you reach for it), so
 * `close` is debounced and `popoverHandlers` (wired onto the popover itself)
 * cancels the pending close / reschedules it, keeping the anchor+popover
 * pair open as one hoverable region. See client/specs/severity-filter.md.
 */
export function useFindingsPopoverAnchor<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = React.useCallback(() => {
    cancelClose();
    setAnchorRect(ref.current?.getBoundingClientRect() ?? null);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setAnchorRect(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  /** Closes immediately — used for scroll, where a stale position is worse
   *  than an abrupt close, and there's nothing to "reach for" mid-scroll. */
  const closeNow = React.useCallback(() => {
    cancelClose();
    setAnchorRect(null);
  }, [cancelClose]);

  React.useEffect(() => {
    if (!anchorRect) return;
    // `capture: true` is what lets this catch scroll on an inner scroll
    // CONTAINER elsewhere on the page (scroll doesn't bubble, but it does
    // fire during the capture phase on ancestors) — the popover has no way
    // to reposition mid-scroll, so a real page/container scroll closes it.
    //
    // BUT a capture listener on `window` also fires for scroll events
    // targeting the popover's OWN `overflow-y: auto` list — the exact
    // interaction the popover exists to support. Without excluding it, every
    // wheel-scroll inside the popover self-closed it before it could render
    // the new scroll position: scrolling down did nothing visible (it opened
    // → scrolled 1px → closed on that same scroll event, every tick), and
    // scrolling up looked identical from the outside. `popoverRef` (attached
    // to the popover's root by `FindingsPopover`) is how this listener tells
    // "the popover scrolled" apart from "the page scrolled".
    const onScroll = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      closeNow();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [anchorRect, closeNow]);

  React.useEffect(() => cancelClose, [cancelClose]);

  return {
    ref,
    popoverRef,
    anchorRect,
    isOpen: anchorRect != null,
    /** Wire onto the hoverable trigger (the FINDINGS cell / Timeline tile). */
    handlers: {
      onMouseEnter: open,
      onMouseLeave: scheduleClose,
      onFocus: open,
      onBlur: (e: React.FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
      },
    },
    /** Wire onto the popover itself so hovering/scrolling INSIDE it (a
     *  separate DOM subtree via the portal) keeps the pair open. */
    popoverHandlers: {
      onMouseEnter: cancelClose,
      onMouseLeave: scheduleClose,
    },
  };
}
