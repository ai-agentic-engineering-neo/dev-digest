import type { Verdict } from "@devdigest/shared";

/** Verdict shown around the brief, derived by the Overview from the newest finished review run. */
export type BriefVerdict =
  | { state: "none" } // no finished review run, or review/run data still loading
  | { state: "error" } // review or run data failed to load
  | {
      state: "ready";
      verdict: Verdict;
      score: number | null;
      findings: number;
      blockers: number;
      agentName: string | null;
      reviewedAt: string;
    };
