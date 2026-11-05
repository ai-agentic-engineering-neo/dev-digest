import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab. */
export interface SkillRow {
  skill: Skill;
  linked: boolean;
  /** Position among linked skills (prompt order); -1 when not linked. */
  position: number;
}

/** Linked skill ids in prompt order. */
export function linkedIds(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/**
 * Rows for the tab: linked skills first in prompt order, then the rest of the
 * workspace's skills by name. Links to skills that no longer exist are dropped.
 */
export function buildSkillRows(skills: Skill[], ids: string[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = ids
    .map((id) => byId.get(id))
    .filter((sk): sk is Skill => !!sk)
    .map((skill, position) => ({ skill, linked: true, position }));
  const linkedSet = new Set(ids);
  const rest = skills
    .filter((sk) => !linkedSet.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false, position: -1 }));
  return [...linked, ...rest];
}

/** Check → append to the end of the prompt; uncheck → remove. */
export function toggleLinked(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Move the linked skill `id` to `toIndex` (clamped) among linked skills. */
export function moveLinked(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const next = ids.filter((x) => x !== id);
  const to = Math.max(0, Math.min(toIndex, next.length));
  next.splice(to, 0, id);
  return next;
}

/** Case-insensitive filter on name / description / type. */
export function matchesFilter(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.type.includes(q)
  );
}
