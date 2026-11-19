import { formatTokensK, formatUsd } from "@/lib/format-cost";

/** Visible text for a badge variant. `full` appends tokens only when known. */
export function badgeText(
  variant: "compact" | "full",
  costUsd: number | null | undefined,
  tokensIn?: number | null,
  tokensOut?: number | null,
): string {
  const cost = formatUsd(costUsd);
  if (variant === "compact" || tokensIn == null || tokensOut == null) return cost;
  return `${cost} · ${formatTokensK(tokensIn, tokensOut)}`;
}

/** Tooltip: exact USD value (or nothing when there is no data). */
export function badgeTitle(costUsd: number | null | undefined): string | undefined {
  return costUsd == null ? undefined : `$${costUsd}`;
}
