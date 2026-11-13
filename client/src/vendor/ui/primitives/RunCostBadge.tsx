import React from "react";

/**
 * USD cost of one review run, optionally with its token usage.
 *
 * Two shapes, both from the design:
 *   compact   <RunCostBadge usd={0.014} />                      → $0.014
 *   detailed  <RunCostBadge usd={0.014} tokens="8.2K→1.3K" />   → $0.014  8.2K→1.3K
 *
 * `tokens` is a pre-formatted string — build it with `formatTokenFlow`. A null
 * cost renders "—", never "$0.00": an unpriced model is missing data, not free.
 */
export function RunCostBadge({
  usd,
  tokens,
  size = "sm",
  muted,
}: {
  usd: number | null | undefined;
  tokens?: string | null;
  size?: "sm" | "lg";
  muted?: boolean;
}) {
  if (usd == null) {
    return (
      <span className="mono" style={{ fontSize: size === "lg" ? 13 : 12, color: "var(--text-muted)" }}>
        —
      </span>
    );
  }
  return (
    <span
      className="mono tnum"
      title="Cost of this review"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: size === "lg" ? 13 : 11.5,
        color: muted ? "var(--text-muted)" : "var(--text-secondary)",
        fontWeight: 500,
      }}
    >
      {formatUsd(usd)}
      {tokens && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{tokens}</span>}
    </span>
  );
}

/**
 * USD for display: 3 decimals below $1, 2 above. A review run costs cents, so
 * 2 decimals alone would print "$0.00" for most real runs.
 */
export function formatUsd(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

/** Token usage as the design writes it: `8.2K→1.3K`. Counts under 1000 stay raw. */
export function formatTokenFlow(tokensIn: number | null, tokensOut: number | null): string | null {
  if (tokensIn == null || tokensOut == null) return null;
  const k = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}K`);
  return `${k(tokensIn)}→${k(tokensOut)}`;
}
