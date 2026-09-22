/** Search params that hold the shareable view state of the PR detail screen. */
export const TAB_PARAM = "tab";
export const TRACE_PARAM = "trace";

export const PR_TABS = ["overview", "findings", "diff"] as const;
export type PrTab = (typeof PR_TABS)[number];
export const DEFAULT_TAB: PrTab = "overview";
