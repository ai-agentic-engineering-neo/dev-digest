/* usePrDetailSearch — the screen's URL-backed view state (?tab, ?trace). */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TAB_PARAM, TRACE_PARAM } from "./constants";
import { parseTab, prDetailPath, withSearchParam } from "./helpers";

export function usePrDetailSearch(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();
  const setParam = (key: string, value: string | null) =>
    router.replace(`${prDetailPath(repoId, number)}${withSearchParam(search.toString(), key, value)}`);

  return {
    tab: parseTab(search.get(TAB_PARAM)),
    traceRunId: search.get(TRACE_PARAM),
    setTab: (tab: string) => setParam(TAB_PARAM, tab),
    openTrace: (runId: string) => setParam(TRACE_PARAM, runId),
    closeTrace: () => setParam(TRACE_PARAM, null),
  };
}
