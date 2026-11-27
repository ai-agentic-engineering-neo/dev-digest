/* useSearchParamState — read/write single query-string params of the current
   route (URL state: shareable, survives reload). Writes use router.replace so
   tab/drawer switches don't pile up history entries. */
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useSearchParamState() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = (key: string): string | null => search.get(key);

  const set = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return { get, set };
}
