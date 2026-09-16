/**
 * Format a run's USD cost. Returns "—" for missing cost data (null/undefined
 * — stale/in-progress/errored runs, or a "done" row that predates cost
 * tracking) — never a fabricated number. A genuine zero-cost run (a free-tier
 * model) renders "$0.00": that IS the real, reconciled number, not a
 * placeholder, so it must not collapse into the same "—" bucket as missing
 * data.
 *
 * Otherwise: round to 6 decimal places, then strip trailing zeros down to a
 * floor of 3 decimal places — the value's own precision decides how many
 * decimals show (3 to 6), never padded, never truncated below what's real.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (!Number.isFinite(usd)) return "—"; // defense-in-depth: never NaN/Infinity on the wire
  if (usd === 0) return "$0.00";
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs < 0.0000005) return `${sign}<$0.000001`;
  // Round via a scaled integer rather than abs.toFixed(6) directly: toFixed
  // inherits whatever binary-float value abs happens to be stored as (e.g.
  // 0.0000135 is actually stored as ...499999999995, so toFixed(6) rounds it
  // DOWN to "013" instead of up to "014"). Multiplying by 1e6 first lands on
  // the intended integer in every case we've verified.
  const scaled = Math.round(abs * 1e6);
  // A value just under 1 (e.g. 0.9999999) can round UP to 1e6 here — that's
  // really $1.00, not $0.100 (padStart is a no-op on a 7-digit string, and
  // the trailing-zero strip would otherwise chew it down to "100").
  if (scaled >= 1e6) return `${sign}$${(scaled / 1e6).toFixed(2)}`;
  let frac = String(scaled).padStart(6, "0");
  while (frac.length > 3 && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${sign}$0.${frac}`;
}
