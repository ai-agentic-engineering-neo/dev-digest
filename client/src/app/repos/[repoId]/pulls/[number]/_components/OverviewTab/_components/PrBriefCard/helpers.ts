/** PrBriefCard — pure helpers (no React). */
import type { PrBrief, PrBriefReview, RunSummary } from "@devdigest/shared";
import { formatCost, formatTokenPair } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";

/** `<provider>/<model>` of the workspace's current feature model ("" when unknown). */
export function modelLabel(choice: { provider: string; model: string } | null | undefined): string {
  return choice ? `${choice.provider}/${choice.model}` : "";
}

/** `<provider>/<model>` the stored brief was written with. */
export function storedModelLabel(brief: Pick<PrBrief, "provider" | "model">): string {
  return `${brief.provider}/${brief.model}`;
}

/** A run is in flight when the server says so or the Generate request is still pending. */
export function isRunning(run: Pick<RunSummary, "status"> | null | undefined, pending: boolean): boolean {
  return run?.status === "running" || pending;
}

/** Cost line of the brief call: formatted cost, compact tokens and the combined text. */
export function costLine(brief: Pick<PrBrief, "cost_usd" | "tokens_in" | "tokens_out">) {
  const cost = formatCost(brief.cost_usd);
  const tokens = formatTokenPair(brief.tokens_in, brief.tokens_out);
  return { cost, tokens, text: `${cost} · ${tokens}` };
}

/** What the (i) popover shows: agent and review time when a review exists, plus the brief model. */
export function infoParts(review: PrBriefReview | null, model: string) {
  return {
    agent: review?.agent_name ?? null,
    reviewedAt: review ? relativeTime(review.created_at) : null,
    model,
  };
}
