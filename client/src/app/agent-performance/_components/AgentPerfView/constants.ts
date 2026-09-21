/** D12/AC-43 — the fixed range presets; 30 is the default. */
export const RANGE_PRESETS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_PRESETS)[number];
export const DEFAULT_RANGE: RangeDays = 30;

export type SortField = "accept_rate" | "runs" | "total_cost_usd";
export type SortDir = "asc" | "desc";
