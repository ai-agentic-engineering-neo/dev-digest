import type { AgentColumn, FindingRecord } from "@devdigest/shared";

/** An AgentColumn with its findings hydrated to full FindingRecord shape.
    `AgentColumnFinding` (the contract returned inline on the column) omits
    confidence/rationale/suggestion/end_line — the page enriches each finding
    once (via `usePrReviews`) before handing columns down to the views, so
    both ColumnsView and TabsView (and the shared FindingCard) always work
    with a complete FindingRecord (AC-17). */
export interface EnrichedAgentColumn extends Omit<AgentColumn, "findings"> {
  findings: FindingRecord[];
}
