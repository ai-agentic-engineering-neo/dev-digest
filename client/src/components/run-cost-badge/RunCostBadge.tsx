/* RunCostBadge — USD cost of a review run (spec: client/specs/run-cost.md).
   compact: "$0.014" (PR list) · full, when tokens are given: "9,119 tok · $0.0013". */

/** null/undefined = no data → "—" (never "$0.00"); a real 0 is data → "$0.0000". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(usd < 0.01 ? 4 : usd < 1 ? 3 : 2)}`;
}

export function RunCostBadge({
  cost,
  tokensIn,
  tokensOut,
}: {
  cost: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const full = tokensIn != null || tokensOut != null;
  const tokens = (tokensIn ?? 0) + (tokensOut ?? 0);
  return (
    <span className="mono" style={{ fontSize: full ? 11 : 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
      {full && `${tokens.toLocaleString()} tok · `}
      {formatCost(cost)}
    </span>
  );
}
