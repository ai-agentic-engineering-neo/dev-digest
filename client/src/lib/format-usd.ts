/* format-usd.ts — compact USD formatting for LLM run costs. Review runs on
   flash-class models usually cost fractions of a cent, so small amounts keep
   more precision instead of collapsing to "$0.00". */

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
