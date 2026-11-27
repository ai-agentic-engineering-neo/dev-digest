import type { FindingRecord, Severity } from "@devdigest/shared";
import { isTextInput } from "../../../../../../../components/app-shell/helpers";
import { G_NAV_TIMEOUT_MS } from "../../../../../../../components/app-shell/constants";
import { SEVERITY_FILTERS, SEVERITY_ORDER } from "../../../constants";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

export interface FindingFilters {
  /** Drop findings below LOW_CONFIDENCE_THRESHOLD. */
  hideLow: boolean;
  /** Keep only this level; null keeps every level. */
  severity: Severity | null;
}

/** Drop low-confidence findings (the "Hide low confidence" toggle). */
export function confidentFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Findings per severity; a level with no findings is 0, never missing. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_FILTERS.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Apply both filters (a finding must pass each one) and sort by severity. */
export function visibleFindings(findings: FindingRecord[], filters: FindingFilters): FindingRecord[] {
  let shown = confidentFindings(findings, filters.hideLow);
  if (filters.severity) shown = shown.filter((f) => f.severity === filters.severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Whether a keydown must not trigger a findings shortcut: a chord, an auto-repeat,
 *  typing in a field, an open dialog, or the second key of a pending `g` nav chord
 *  (`gSince` = when `g` was pressed, null if none). */
export function shouldIgnoreShortcut(
  e: KeyboardEvent,
  gSince: number | null = null,
  now: number = Date.now(),
): boolean {
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    e.repeat ||
    isTextInput(e.target) ||
    document.querySelector('[role="dialog"]') !== null ||
    (gSince !== null && now - gSince < G_NAV_TIMEOUT_MS)
  );
}
