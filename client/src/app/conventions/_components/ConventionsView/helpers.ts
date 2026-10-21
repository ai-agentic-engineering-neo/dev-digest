import type { ConventionCandidate } from "@devdigest/shared";
import { CHARS_PER_TOKEN } from "./constants";

/** Visible candidates: rejected ones are hidden unless asked for. */
export function visibleCandidates(list: ConventionCandidate[], showRejected: boolean): ConventionCandidate[] {
  return showRejected ? list : list.filter((c) => c.status !== "rejected");
}

export function countByStatus(list: ConventionCandidate[]) {
  return {
    accepted: list.filter((c) => c.status === "accepted").length,
    rejected: list.filter((c) => c.status === "rejected").length,
    total: list.filter((c) => c.status !== "rejected").length,
  };
}

/** Same approximation the trace uses when no tokenizer is at hand. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
