"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** One URL query parameter as state: `[value, setValue]`.
   `setValue` rewrites the URL with `router.replace`, keeping every other
   parameter; `null` removes the key. The value is always written explicitly, so
   a param that has a UI default (e.g. `?status`) can still be pinned to it. */
export function useSearchParamState(key: string): [string | null, (val: string | null) => void] {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setValue = (val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return [search.get(key), setValue];
}
