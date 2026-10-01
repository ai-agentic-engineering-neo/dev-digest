import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_RANK } from "./constants";

/** Highest severity among the findings (falls back to the first one's). */
export function topSeverity(findings: FindingRecord[]): string | undefined {
  return SEVERITY_RANK.find((sev) => findings.some((f) => f.severity === sev)) ?? findings[0]?.severity;
}
