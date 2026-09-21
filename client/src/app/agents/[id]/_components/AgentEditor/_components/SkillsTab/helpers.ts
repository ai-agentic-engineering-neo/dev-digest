import { arrayMove } from "@dnd-kit/sortable";
import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";

/** One row of the Skills tab: a catalog skill plus whether this agent links it. */
export interface SkillRow {
  skill: SkillListItem;
  linked: boolean;
}

/**
 * Initial ordering: the agent's linked skills first (in link order), followed by
 * every unlinked skill in catalog order. Links to skills missing from the catalog
 * (deleted meanwhile) are dropped.
 */
export function buildRows(catalog: readonly SkillListItem[], links: readonly AgentSkillLink[]): SkillRow[] {
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const linkedIds = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.skill_id)
    .filter((id) => byId.has(id));
  const linkedSet = new Set(linkedIds);
  return [
    ...linkedIds.map((id) => ({ skill: byId.get(id)!, linked: true })),
    ...catalog.filter((skill) => !linkedSet.has(skill.id)).map((skill) => ({ skill, linked: false })),
  ];
}

/**
 * Re-align locally edited rows with a fresh catalog: refresh skill data, drop
 * skills that no longer exist, and append newly created ones as unlinked.
 */
export function syncRows(rows: readonly SkillRow[], catalog: readonly SkillListItem[]): SkillRow[] {
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const kept = rows.filter((r) => byId.has(r.skill.id)).map((r) => ({ ...r, skill: byId.get(r.skill.id)! }));
  const known = new Set(kept.map((r) => r.skill.id));
  return [...kept, ...catalog.filter((skill) => !known.has(skill.id)).map((skill) => ({ skill, linked: false }))];
}

/** Move the row `activeId` to the position currently held by `overId` (by id, so it works on the full list). */
export function reorder(rows: readonly SkillRow[], activeId: string, overId: string): SkillRow[] {
  const from = rows.findIndex((r) => r.skill.id === activeId);
  const to = rows.findIndex((r) => r.skill.id === overId);
  if (from < 0 || to < 0 || from === to) return [...rows];
  return arrayMove([...rows], from, to);
}

/** Flip the `linked` flag of one row. */
export function toggleRow(rows: readonly SkillRow[], id: string): SkillRow[] {
  return rows.map((r) => (r.skill.id === id ? { ...r, linked: !r.linked } : r));
}

/** Ids of the linked rows in current list order — the payload for `setSkills` (order = index). */
export function toSkillIds(rows: readonly SkillRow[]): string[] {
  return rows.filter((r) => r.linked).map((r) => r.skill.id);
}

export function countLinked(rows: readonly SkillRow[]): number {
  return rows.reduce((n, r) => n + (r.linked ? 1 : 0), 0);
}

/** Case-insensitive match on name or description; an empty query keeps every row. */
export function filterRows(rows: readonly SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) => r.skill.name.toLowerCase().includes(q) || r.skill.description.toLowerCase().includes(q),
  );
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
