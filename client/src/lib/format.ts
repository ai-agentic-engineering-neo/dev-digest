/**
 * Compact display formatters for run cost and token counts (cost badge, run
 * trace). Missing data renders as an em dash — never as "$0.00", which would
 * read as "free" rather than "unknown".
 */

export const NO_DATA = "—";

/** USD: "$0.012" below $1, "$1.50" from $1, "<$0.001" for sub-tenth-cent, "$0" for a real zero. */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_DATA;
  if (usd === 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** One decimal under 100 of a unit ("8.2K", "1.3M"), whole above ("128K"); trailing ".0" dropped. */
function compact(n: number, unit: number, suffix: string): string {
  const v = n / unit;
  const s = v < 100 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v).toString();
  return `${s}${suffix}`;
}

/** Token count: "950", "8.2K", "1.3M". */
export function formatTokenCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return NO_DATA;
  if (n < 1000) return String(Math.round(n));
  if (n < 999_950) return compact(n, 1000, "K");
  return compact(n, 1_000_000, "M");
}

/** Input→output token flow: "8.2K→1.3K"; em dash when neither side is known. */
export function formatTokenFlow(tokensIn: number | null | undefined, tokensOut: number | null | undefined): string {
  if (tokensIn == null && tokensOut == null) return NO_DATA;
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}

/** Cost badge text: "$0.014 · 8.2K→1.3K"; just "—" when the run has no usage data at all. */
export function formatRunCost(
  usd: number | null | undefined,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  const flow = formatTokenFlow(tokensIn, tokensOut);
  if (usd == null && flow === NO_DATA) return NO_DATA;
  return `${formatUsd(usd)} · ${flow}`;
}
