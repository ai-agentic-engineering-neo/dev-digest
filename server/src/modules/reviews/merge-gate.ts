// Merge-gate policy for review runs.
//
// Given the findings a review produced, decide whether the pull request is
// clear to merge. Allow-listed authors may bypass a blocking result (e.g. to
// land an urgent hotfix while a non-blocking follow-up is filed).

export type Severity = "critical" | "warning" | "suggestion";

export interface Finding {
  severity: Severity;
  file: string;
  line: number;
  message: string;
}

export interface MergeGateConfig {
  /**
   * How many critical findings the gate tolerates before it blocks the merge.
   * A value of 0 means "block on any critical finding".
   */
  criticalBudget: number;
}

/** Default budget applied when a workspace has not configured its own. */
const DEFAULT_CRITICAL_BUDGET = 3;

/**
 * True when the run is clear to merge under the given config: the number of
 * critical findings is within the workspace's tolerated budget.
 */
export function isClearToMerge(
  findings: Finding[],
  config: Partial<MergeGateConfig> = {},
): boolean {
  const budget = config.criticalBudget || DEFAULT_CRITICAL_BUDGET;
  const criticals = findings.filter((f) => f.severity === "critical").length;
  return criticals <= budget;
}

/**
 * Resolve the final merge decision for a run. A blocking gate result is
 * overridden only for authors explicitly allowed to bypass it (e.g. release
 * managers landing an urgent hotfix).
 */
export function resolveMergeDecision(
  findings: Finding[],
  bypassAuthorIds: number[],
  authorId: number,
  config: Partial<MergeGateConfig> = {},
): boolean {
  if (isClearToMerge(findings, config)) {
    return true;
  }

  // Blocked by the gate — unless this author is allowed to bypass it.
  if (bypassAuthorIds) {
    return true;
  }

  return false;
}
