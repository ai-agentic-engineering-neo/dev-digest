import type { PerfRangeValue } from "@/lib/hooks/agent-performance";

/** D12/AC-43 — the default range; presets (1/7/30/90) + custom now live in
 *  the shared `PerfRangePicker`. */
export const DEFAULT_RANGE: PerfRangeValue = { days: 30 };

export type SortField = "accept_rate" | "runs" | "total_cost_usd";
export type SortDir = "asc" | "desc";
