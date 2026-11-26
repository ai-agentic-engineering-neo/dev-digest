import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab. `position` is the 0-based prompt order, attached rows only. */
export interface SkillRowModel {
  skill: Skill;
  attached: boolean;
  position: number | null;
}

/**
 * Every workspace skill as a row: attached ones first in link `order`, then the
 * unattached ones sorted by name. Links to skills missing from `skills` are dropped.
 */
export function orderRows(skills: readonly Skill[], links: readonly AgentSkillLink[]): SkillRowModel[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const attached = [...links]
    .sort((a, b) => a.order - b.order)
    .map((link) => byId.get(link.skill_id))
    .filter((skill): skill is Skill => skill !== undefined);
  const attachedIds = new Set(attached.map((skill) => skill.id));
  const unattached = skills
    .filter((skill) => !attachedIds.has(skill.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...attached.map((skill, position) => ({ skill, attached: true, position })),
    ...unattached.map((skill) => ({ skill, attached: false, position: null })),
  ];
}

/** Ordered ids of the attached rows (the `skill_ids` payload). */
export function attachedIdsOf(rows: readonly SkillRowModel[]): string[] {
  return rows.filter((row) => row.attached).map((row) => row.skill.id);
}

/** Detach `id` if attached, else append it to the end. Returns a new array. */
export function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Move the item at `from` to index `to`. Out-of-range or no-op moves return a copy unchanged. */
export function move(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Case-insensitive match on name or description; an empty query keeps every row. */
export function filterRows(rows: readonly SkillRowModel[], query: string): SkillRowModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    ({ skill }) => skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q),
  );
}
