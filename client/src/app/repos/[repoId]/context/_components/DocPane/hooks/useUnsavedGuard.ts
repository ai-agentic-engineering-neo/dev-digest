/* useUnsavedGuard — while `dirty`, confirm before a reload/close (beforeunload), an in-app link
   click (capture-phase, so it runs before Next's Link handler), or the browser Back button.
   Back: a guard entry (a copy of the current history state, so Next's own popstate handler sees the
   same page and does nothing) is pushed while dirty; leaving through it asks first. */
"use client";

import { useEffect } from "react";

function sameOriginLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const a = event.target.closest("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.target && a.target !== "_self") return null;
  return a.origin === window.location.origin ? a : null;
}

const GUARD_KEY = "__devdigestUnsavedGuard";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isGuardState(v: unknown): boolean {
  return isRecord(v) && v[GUARD_KEY] === true;
}

export function useUnsavedGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!sameOriginLink(e)) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Back/Forward: the guard entry is popped first; stay (re-push it) unless the user confirms.
    // The guard entry copies Next's state plus a marker, so a re-run of this effect (message change,
    // Strict Mode) doesn't stack a second entry.
    const pushGuard = () => {
      const state: unknown = window.history.state;
      if (isGuardState(state)) return;
      window.history.pushState({ ...(isRecord(state) ? state : {}), [GUARD_KEY]: true }, "", window.location.href);
    };
    const onPopState = () => {
      if (window.confirm(message)) {
        window.removeEventListener("popstate", onPopState);
        window.history.back();
      } else {
        pushGuard();
      }
    };
    pushGuard();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
