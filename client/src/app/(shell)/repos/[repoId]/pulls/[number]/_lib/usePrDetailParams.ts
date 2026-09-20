"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * URL-param state for the PR detail page: the active tab (`?tab=`) and the
 * open trace drawer's run id (`?trace=`). Both live in the URL (not
 * useState) so they survive reload/back-forward and are shareable.
 */
export function usePrDetailParams(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  const setTab = (t: string) => setParam("tab", t);

  return { tab, traceRunId, setTab, setParam };
}
