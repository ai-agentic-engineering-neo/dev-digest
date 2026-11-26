/* Pure helpers for the Conventions page (no React, no i18n). */
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionEvidence,
  ConventionScan,
  ConventionStatus,
} from "@devdigest/shared";
import { FALLBACK_REF, SKILL_NAME_MAX, SKILL_NAME_RE, type StatusFilter } from "./constants";

/** Status of a candidate; rows from older producers fall back to `accepted`. */
export function statusOf(c: ConventionCandidate): ConventionStatus {
  return c.status ?? (c.accepted ? "accepted" : "pending");
}

export function categoryOf(c: ConventionCandidate): ConventionCategory {
  return c.category ?? "general";
}

/** Line number used when a row has no verified lines (legacy rows without `details`). */
export const NO_LINE = 0;

/** Evidence list; a candidate without `evidence` shows its flat first evidence, with no lines. */
export function evidenceOf(c: ConventionCandidate): ConventionEvidence[] {
  if (c.evidence && c.evidence.length > 0) return c.evidence;
  return c.evidence_path
    ? [{ path: c.evidence_path, line_start: NO_LINE, line_end: NO_LINE, snippet: c.evidence_snippet }]
    : [];
}

export function hasLines(e: ConventionEvidence): boolean {
  return e.line_start > NO_LINE;
}

/** The newer of two scan metas (the scan reply vs the list), by `at`. */
export function newestScan(
  a: ConventionScan | null | undefined,
  b: ConventionScan | null | undefined,
): ConventionScan | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.at >= b.at ? a : b;
}

export function countByStatus(list: ConventionCandidate[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: list.length, pending: 0, accepted: 0, rejected: 0 };
  for (const c of list) out[statusOf(c)] += 1;
  return out;
}

export function filterByStatus(list: ConventionCandidate[], filter: StatusFilter): ConventionCandidate[] {
  return filter === "all" ? list : list.filter((c) => statusOf(c) === filter);
}

/** Default selection: accepted rules not yet in any skill. */
export function defaultSelection(list: ConventionCandidate[]): Set<string> {
  return new Set(
    list.filter((c) => statusOf(c) === "accepted" && (c.skill_names ?? []).length === 0).map((c) => c.id),
  );
}

/** Only accepted rules can go into a skill — the selection is narrowed to them. */
export function selectedAccepted(list: ConventionCandidate[], selected: ReadonlySet<string>): string[] {
  return list.filter((c) => selected.has(c.id) && statusOf(c) === "accepted").map((c) => c.id);
}

export function toggleId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Accept ↔ Reject only: clicking the already-active state does nothing (null).
 * There is no way back to pending, because a re-scan deletes pending rows —
 * an undo would drop the rule together with its skill link.
 */
export function nextStatus(
  current: ConventionStatus,
  clicked: "accepted" | "rejected",
): "accepted" | "rejected" | null {
  return current === clicked ? null : clicked;
}

/** `path:4`, `path:4-9`, or just `path` when the lines are unknown. */
export function evidenceLabel(e: ConventionEvidence): string {
  if (!hasLines(e)) return e.path;
  return e.line_start === e.line_end ? `${e.path}:${e.line_start}` : `${e.path}:${e.line_start}-${e.line_end}`;
}

export function refFor(commitSha: string | null | undefined): string {
  return commitSha || FALLBACK_REF;
}

export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= SKILL_NAME_MAX && SKILL_NAME_RE.test(name);
}

/** Confidence 0–1 → colour token (status tokens are --ok / --warn / --crit). */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "var(--ok)";
  if (confidence >= 0.65) return "var(--warn)";
  return "var(--crit)";
}

/** `/skills/:id?tab=config` — where a new skill's body is edited. */
export function skillConfigHref(skillId: string): string {
  return `/skills/${encodeURIComponent(skillId)}?tab=config`;
}
