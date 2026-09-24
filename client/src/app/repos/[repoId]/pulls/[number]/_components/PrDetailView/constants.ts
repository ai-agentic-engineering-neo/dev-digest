/** Search params that hold the shareable view state of the PR detail screen. */
export const TAB_PARAM = "tab";
export const TRACE_PARAM = "trace";
/** Files changed's Smart/Original order toggle (server/specs/06-smart-diff.md). */
export const ORDER_PARAM = "order";

export const PR_TABS = ["overview", "findings", "diff"] as const;
export type PrTab = (typeof PR_TABS)[number];
export const DEFAULT_TAB: PrTab = "overview";

export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];
export const DEFAULT_ORDER: DiffOrder = "smart";
