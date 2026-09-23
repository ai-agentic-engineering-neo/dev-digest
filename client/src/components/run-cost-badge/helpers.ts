/* Formatting for a run's cost + token usage (server/specs/01-run-cost-badge.md).
   Pure, so the badge and its tests share one set of rules. */

/** What a run with no cost/usage data shows — never "$0.00". */
export const NO_DATA = "—";

/** Drops trailing zeros of a fixed-point string: "0.0030" → "0.003", "12.0" → "12". */
function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * USD for a run: "$1.23" (≥ $1), "$0.014" (≥ 1¢), "$0.0013" (2 significant
 * digits below 1¢). `0` is real data (a free model) → "$0.00"; unknown → "—".
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return NO_DATA;
  if (usd === 0) return "$0.00";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  const digits = Math.min(20, 1 - Math.floor(Math.log10(usd)));
  return `$${trimZeros(usd.toFixed(digits))}`;
}

/** Compact token count: 950 → "950", 8212 → "8.2K", 1_250_000 → "1.3M". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10; // thousands, one decimal
  if (k < 1000) return `${trimZeros(k.toFixed(1))}K`;
  return `${trimZeros((Math.round(n / 100_000) / 10).toFixed(1))}M`;
}

/** "8.2K→1.3K"; null when the run has no token usage (missing or 0/0). */
export function formatTokenPair(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null || tokensOut == null || tokensIn + tokensOut === 0) return null;
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}
