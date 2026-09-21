import type { AgentSkillDetail, Skill } from "@devdigest/shared";

/**
 * Pure list logic for the Skills tab. Kept out of the component so the
 * reorder/attach rules are testable without rendering, and — more to the point
 * — without simulating a drag, which is the part of this UI that is awkward to
 * drive from a test.
 */

/** A row in the tab: every skill in the workspace, with its link state (if any). */
export interface SkillRow {
  skill: Skill;
  /** Linked to this agent at all. Unlinked skills render unchecked at the end. */
  linked: boolean;
  /** Per-agent switch. Meaningless when `linked` is false. */
  enabled: boolean;
}

/**
 * Build the tab's rows: linked skills first in their stored order, then the
 * rest alphabetically. Linked-and-ordered first is what makes the list read as
 * "this is the prompt, top to bottom", with the unused library below it.
 */
export function buildRows(skills: Skill[], links: AgentSkillDetail[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linkedIds = new Set(links.map((l) => l.skill.id));

  const linked: SkillRow[] = [...links]
    .sort((a, b) => a.order - b.order)
    // A link can outlive its skill only in a stale cache; drop those rather
    // than rendering a row with no name.
    .filter((l) => byId.has(l.skill.id))
    .map((l) => ({ skill: byId.get(l.skill.id)!, linked: true, enabled: l.enabled }));

  const unlinked: SkillRow[] = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false, enabled: false }));

  return [...linked, ...unlinked];
}

/**
 * Move the item at `from` to `to`, returning a new array. Used by the drag
 * handler; the classic splice-out/splice-in, which already does the right
 * thing for both directions because the removal shifts the tail.
 */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * The payload the API expects: only linked rows, in display order. Unlinked
 * rows are simply absent — the server replaces the whole set, so "not in the
 * list" is how a skill gets detached.
 */
export function toLinkPayload(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return rows
    .filter((r) => r.linked)
    .map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** How many linked skills are actually switched on (the header badge). */
export function countEnabled(rows: SkillRow[]): number {
  return rows.filter((r) => r.linked && r.enabled).length;
}

/** Case-insensitive filter over name + description. */
export function filterRows(rows: SkillRow[], search: string): SkillRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${r.skill.name} ${r.skill.description}`.toLowerCase().includes(q));
}
