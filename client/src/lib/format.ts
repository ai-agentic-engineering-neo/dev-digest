/** Shared display formatters. */

/**
 * USD amount for run/PR cost badges — ONE format everywhere (timeline, PR
 * list, trace) so decimals line up in columns:
 *   < $1 → 4 decimals ($0.0041, $0.0140, $0.0000 for a free model)
 *   ≥ $1 → 2 decimals ($1.27)
 *   > 0 but < $0.0001 → "<$0.0001" (a real run cost $0.0000498 — must not read as free)
 *   null/undefined → "—" (unknown)
 * `estimated` (tokens × list price, not the billed amount) only prefixes "~";
 * the digits follow the same rules: ~$0.0041.
 */
export function formatUsd(
  value: number | null | undefined,
  opts?: { estimated?: boolean | null },
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const approx = opts?.estimated ? "~" : "";
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.0001) return `${approx}<$0.0001`;
  return `${approx}$${value.toFixed(abs < 1 ? 4 : 2)}`;
}
