/* Types shared by several PR-detail components (FindingsPanel, SeverityCounters). */
import type { Severity } from "@devdigest/shared";

export interface SeverityCount {
  severity: Severity;
  count: number;
}
