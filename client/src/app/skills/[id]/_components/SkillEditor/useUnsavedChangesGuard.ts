"use client";

import React from "react";

/** Internal link that leaves the current page (not a new tab, download or a
 *  same-path ?tab= switch). */
function leavingHref(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
  const url = new URL(a.href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}

/** While `dirty`: warn on reload/close (beforeunload) and confirm before an
 *  in-app link navigates away. The App Router has no route-change event, so
 *  link clicks are caught in the capture phase before Next's <Link> sees them. */
export function useUnsavedChangesGuard(dirty: boolean, message: string): void {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!leavingHref(e) || window.confirm(message)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
