/** Pure helpers for DiffTab (Smart Order, L03). No React, no fetching. */
import type { FindingRecord, PrFile, ReviewRecord, Severity, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { isActiveFinding } from "@/lib/severity";
import { ROLE_ORDER } from "./constants";

export type DiffOrder = "smart" | "original";

/** URL `?order=` → the mode. Anything but the literal "original" is Smart
    (including the parameter's absence, i.e. `null`). */
export function orderFromParam(param: string | null): DiffOrder {
  return param === "original" ? "original" : "smart";
}

/** The mode → the `?order=` value. Smart clears the parameter. */
export function orderToParam(order: DiffOrder): string | null {
  return order === "smart" ? null : "original";
}

function reviewTime(r: Pick<ReviewRecord, "created_at">): number {
  return new Date(r.created_at).getTime();
}

/**
 * Keep only the latest review per agent — reviews with `agent_id === null`
 * are ALL one group. Mirrors `server/src/modules/smart-diff/helpers.ts`'s
 * `latestReviewPerAgent` (shared fixture: Test brief TP-1). Within a group,
 * the greatest `created_at` wins; ties break on the greater `id`.
 */
export function latestReviewsPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const groups = new Map<string | null, ReviewRecord>();
  for (const review of reviews) {
    const key = review.agent_id;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, review);
      continue;
    }
    const rt = reviewTime(review);
    const ct = reviewTime(current);
    if (rt > ct || (rt === ct && review.id > current.id)) groups.set(key, review);
  }
  return [...groups.values()];
}

/**
 * Every finding (dismissed included) from the latest review per agent,
 * grouped by file path — the SINGLE source of truth for finding markers
 * (dots, chips, inline cards). The server's `finding_lines` is never read by
 * the UI (see `server/specs/L03-smart-diff.md` § Contract).
 */
export function findingsByFile(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const kept = latestReviewsPerAgent(reviews);
  const byFile = new Map<string, FindingRecord[]>();
  for (const review of kept) {
    for (const finding of review.findings) {
      const list = byFile.get(finding.file) ?? [];
      list.push(finding);
      byFile.set(finding.file, list);
    }
  }
  return byFile;
}

export interface SmartFileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Lay the PR's files out into role groups: path→role comes from the
 * smart-diff response, but files WITHIN a group keep the PR's original
 * (GitHub) order — `pr_files` has no guaranteed order server-side (see the
 * server spec's risks section). A path missing from the smart-diff response
 * falls into `core` ("everything else"). Empty groups are dropped.
 */
export function layoutSmartGroups(files: PrFile[], smart: SmartDiff | undefined): SmartFileGroup[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  for (const group of smart?.groups ?? []) {
    for (const f of group.files) roleByPath.set(f.path, group.role);
  }
  const byRole = new Map<SmartDiffRole, PrFile[]>();
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? "core";
    const list = byRole.get(role) ?? [];
    list.push(file);
    byRole.set(role, list);
  }
  const result: SmartFileGroup[] = [];
  for (const role of ROLE_ORDER) {
    const list = byRole.get(role);
    if (list && list.length > 0) result.push({ role, files: list });
  }
  return result;
}

/**
 * Per severity, the count of files (among `files`) that have at least one
 * ACTIVE (non-dismissed) finding of that severity. A file with two WARNINGs
 * counts once; a file with both CRITICAL and WARNING counts in both.
 */
export function filesPerSeverity(
  files: PrFile[],
  byFile: Map<string, FindingRecord[]>,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const file of files) {
    const present = new Set<Severity>();
    for (const f of byFile.get(file.path) ?? []) {
      if (isActiveFinding(f)) present.add(f.severity);
    }
    for (const sev of present) counts[sev] += 1;
  }
  return counts;
}

/** A finding's line range as the inline card shows it: "61" or "61-74". */
export function lineRange(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}
