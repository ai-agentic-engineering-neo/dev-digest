import type { Skill } from "@devdigest/shared";
import { matchesSkillQuery } from "@/lib/skills";

/** Move an item inside an array, returning a new array. */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Attach (append at the end) or detach a skill, preserving the rest of the order. */
export function toggleSkill(selected: string[], skillId: string): string[] {
  return selected.includes(skillId)
    ? selected.filter((id) => id !== skillId)
    : [...selected, skillId];
}

/**
 * Linked skills first, in PROMPT order, then the rest alphabetically. Reordering
 * is only meaningful among the linked ones, so they have to be contiguous and
 * on top — otherwise "move up" would jump over rows that carry no position.
 */
export function orderedSkills(all: Skill[], selected: string[], filter: string): Skill[] {
  const matches = all.filter((s) => matchesSkillQuery(s, filter));
  const byId = new Map(matches.map((s) => [s.id, s]));
  const linked = selected.map((id) => byId.get(id)).filter((s): s is Skill => !!s);
  const rest = matches
    .filter((s) => !selected.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...linked, ...rest];
}
