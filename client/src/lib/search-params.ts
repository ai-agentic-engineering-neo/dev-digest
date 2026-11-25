/* lib/search-params.ts — URL search-param state (tab, filters, drawers).
   Replaces the URLSearchParams + router.replace snippet each page used to
   copy-paste. The pure builder is separate so it is testable without Next. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Return `current` query string with `key` set to `value` (or removed when null). */
export function withSearchParam(current: string, key: string, value: string | null): string {
  const sp = new URLSearchParams(current);
  if (value == null) sp.delete(key);
  else sp.set(key, value);
  return sp.toString();
}

/** A stable setter that replaces one search param on the current path (no history entry). */
export function useSetSearchParam() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return React.useCallback(
    (key: string, value: string | null) => {
      const qs = withSearchParam(search.toString(), key, value);
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [search, router, pathname],
  );
}
