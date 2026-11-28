/* useUnsavedGuard — while `dirty`, a click on any in-app link that leaves the
   current page (another skill, the sidebar, a breadcrumb) is held back until
   the user confirms. Browser-level navigation is out of scope (spec non-goal). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { leavingHref } from "./helpers";

export interface UnsavedGuard {
  /** Where the held-back click was going; non-null while the confirm is open. */
  pendingHref: string | null;
  confirm: () => void;
  cancel: () => void;
}

export function useUnsavedGuard(dirty: boolean, onDiscard: () => void): UnsavedGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const href = leavingHref(anchor.href, window.location.href);
      if (!href) return;
      // Capture phase on document runs before React's root listener, so the
      // Link's own navigation never starts.
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  return {
    pendingHref,
    confirm: () => {
      const href = pendingHref;
      setPendingHref(null);
      onDiscard();
      if (href) router.push(href);
    },
    cancel: () => setPendingHref(null),
  };
}
