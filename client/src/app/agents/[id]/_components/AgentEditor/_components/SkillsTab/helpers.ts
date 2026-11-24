import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";

/** Skill ids linked to the agent, in link order (links to unknown skills are dropped). */
export function linkedIds(links: AgentSkillLink[], skills: SkillListItem[]): string[] {
  const known = new Set(skills.map((s) => s.id));
  return [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.skill_id)
    .filter((id) => known.has(id));
}

/** Linked skills first (in `ids` order), then the unlinked ones in list order. */
export function orderRows(skills: SkillListItem[], ids: string[]): { skill: SkillListItem; linked: boolean }[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linked = ids.flatMap((id) => {
    const skill = byId.get(id);
    return skill ? [{ skill, linked: true }] : [];
  });
  const set = new Set(ids);
  const rest = skills.filter((s) => !set.has(s.id)).map((skill) => ({ skill, linked: false }));
  return [...linked, ...rest];
}

/** Check (append at the end) or uncheck a skill; returns the new ordered id list. */
export function toggleLinked(ids: string[], id: string, on: boolean): string[] {
  if (on) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}

/** Move the item at `from` to position `to` (clamped). Returns a new array. */
export function moveItem(ids: string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length) return ids;
  const target = Math.max(0, Math.min(ids.length - 1, to));
  if (target === from) return ids;
  const next = [...ids];
  next.splice(target, 0, next.splice(from, 1)[0]!);
  return next;
}

/** Move `id` one step up (-1) or down (+1). */
export function moveById(ids: string[], id: string, delta: -1 | 1): string[] {
  const i = ids.indexOf(id);
  return i < 0 ? ids : moveItem(ids, i, i + delta);
}

/** Drag-and-drop: put `dragId` where `overId` currently is. */
export function dropOn(ids: string[], dragId: string, overId: string): string[] {
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return ids;
  return moveItem(ids, from, to);
}

/** Case-insensitive name/description filter over rows. */
export function filterRows<T extends { skill: SkillListItem }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => `${r.skill.name} ${r.skill.description}`.toLowerCase().includes(needle));
}
