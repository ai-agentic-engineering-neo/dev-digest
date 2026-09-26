import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab: a workspace skill and whether/where this agent links it. */
export interface SkillRow {
  skill: Skill;
  linked: boolean;
}

/**
 * Linked skills first, in link order (= prompt order); unlinked skills after,
 * alphabetically. Links whose skill no longer exists are dropped.
 */
export function mergeRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linkedIds = [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
  const linked = linkedIds.map((id) => byId.get(id)).filter((s): s is Skill => !!s);
  const linkedSet = new Set(linked.map((s) => s.id));
  const unlinked = skills.filter((s) => !linkedSet.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  return [...linked.map((skill) => ({ skill, linked: true })), ...unlinked.map((skill) => ({ skill, linked: false }))];
}

/** The ordered linked ids from the rows (what `POST /agents/:id/skills` takes). */
export function linkedIds(rows: SkillRow[]): string[] {
  return rows.filter((r) => r.linked).map((r) => r.skill.id);
}

/** Move `from` to `to` inside `ids`; out-of-range or no-op moves return the input. */
export function moveId(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Case-insensitive filter over name and type. */
export function filterRows(rows: SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.skill.name.toLowerCase().includes(q) || r.skill.type.includes(q));
}
