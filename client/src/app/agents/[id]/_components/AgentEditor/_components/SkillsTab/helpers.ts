import { arrayMove } from "@dnd-kit/sortable";
import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Linked skills in link (prompt) order, then the rest by name. Links to a
 *  skill that no longer exists are dropped. */
export function splitSkills(
  skills: readonly Skill[],
  links: readonly AgentSkillLink[],
): { linked: Skill[]; unlinked: Skill[] } {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => byId.get(l.skill_id))
    .filter((s): s is Skill => s !== undefined);
  const linkedIds = new Set(linked.map((s) => s.id));
  const unlinked = skills.filter((s) => !linkedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { linked, unlinked };
}

/** Case-insensitive match on name + description. */
export function matchesFilter(skill: Skill, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return !q || `${skill.name} ${skill.description}`.toLowerCase().includes(q);
}

/** The ordered id list after (un)checking a skill: a new link goes last. */
export function toggleLink(ids: readonly string[], id: string, on: boolean): string[] {
  const rest = ids.filter((x) => x !== id);
  return on ? [...rest, id] : rest;
}

/** The ordered id list after dropping `activeId` onto `overId` (null = no move). */
export function moveLink(ids: readonly string[], activeId: string, overId: string | null): string[] | null {
  if (!overId || activeId === overId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return null;
  return arrayMove([...ids], from, to);
}
