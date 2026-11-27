import type { Skill, SkillSafety, SkillSafetyFinding } from "@devdigest/shared";

/** A flagged skill failed the injection scan: it cannot be enabled or newly linked. */
export function isFlagged(skill: Pick<Skill, "safety"> | { safety?: SkillSafety | null }): boolean {
  return skill.safety?.status === "flagged";
}

/** Findings that lock the skill (a `warn` is shown but does not block). */
export function blockingFindings(safety: SkillSafety | null | undefined): SkillSafetyFinding[] {
  return (safety?.findings ?? []).filter((f) => f.severity === "block");
}

/** DOM id of a finding's highlight, so the banner can scroll to it. */
export const findingAnchorId = (index: number) => `skill-finding-${index}`;

/** A run of body text; `findingIndex` is set when the run is a highlighted finding. */
export interface BodySegment {
  /** Char offset of the run in the body (unique → a stable React key). */
  start: number;
  text: string;
  finding?: SkillSafetyFinding;
  findingIndex?: number;
}

/**
 * Split the body into plain and highlighted runs. Findings are sorted by
 * position; an overlap with an earlier finding is clipped, and offsets past
 * the body (a stale scan) are clamped, so every char appears exactly once.
 */
export function highlightSegments(body: string, findings: readonly SkillSafetyFinding[]): BodySegment[] {
  const sorted = findings
    .map((finding, findingIndex) => ({ finding, findingIndex }))
    .sort((a, b) => a.finding.start - b.finding.start);
  const out: BodySegment[] = [];
  let cursor = 0;
  for (const { finding, findingIndex } of sorted) {
    const start = Math.max(cursor, Math.min(finding.start, body.length));
    const end = Math.min(Math.max(finding.end, start), body.length);
    if (end <= start) continue;
    if (start > cursor) out.push({ start: cursor, text: body.slice(cursor, start) });
    out.push({ start, text: body.slice(start, end), finding, findingIndex });
    cursor = end;
  }
  if (cursor < body.length) out.push({ start: cursor, text: body.slice(cursor) });
  return out;
}
