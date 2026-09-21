import { formatCost } from "@/lib/format";
import { ACCEPT_RATE_LOW, ACCEPT_RATE_MID, AVG_COST_DECIMALS, MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/**
 * Colour for the accept-rate segment of the tile's stats line:
 * `<30` critical, `<60` warning, otherwise ok. `null` (nothing accepted or
 * dismissed yet) is muted — there is no rate to judge.
 */
export function acceptColor(rate: number | null): string {
  if (rate == null) return "var(--text-muted)";
  if (rate < ACCEPT_RATE_LOW) return "var(--crit)";
  if (rate < ACCEPT_RATE_MID) return "var(--warn)";
  return "var(--ok)";
}

/** Accept rate as a whole percent ("14"); "—" when there is no rate yet. */
export function formatAcceptRate(rate: number | null): string {
  return rate == null ? "—" : String(Math.round(rate));
}

/** Average run cost for the tile ("$0.007"); "—" when unknown. */
export function formatAvgCost(usd: number | null): string {
  return formatCost(usd, AVG_COST_DECIMALS);
}
