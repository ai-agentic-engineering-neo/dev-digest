/** Constants for AgentCard. */

/** Model → chip colour. Falls back to --text-secondary for unknown models. */
export const MODEL_COLOR: Record<string, string> = {
  "gpt-4.1": "#3b82f6",
  "gpt-4o": "#10b981",
  "gpt-4o-mini": "#8b5cf6",
  o1: "#f59e0b",
};

/** Accept-rate colour bands (percent, 0-100): below LOW = critical, below MID = warning, else ok. */
export const ACCEPT_RATE_LOW = 30;
export const ACCEPT_RATE_MID = 60;

/** Decimals for the tile's average run cost ("$0.007 avg"). */
export const AVG_COST_DECIMALS = 3;
