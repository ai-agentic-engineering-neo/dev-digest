import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { MOVE_KEYS } from "./constants";

/** A copy of `list` with the item at `from` moved to `to` (indexes clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T);
  return next;
}

/** Rows can be reordered only while the list is unfiltered (a filtered view hides neighbours). */
export function isReorderable(filter: string): boolean {
  return filter.trim() === "";
}

/**
 * Whether moving the row at `from` to `to` changes anything. `moveItem` would
 * clamp an out-of-range target, so a move past either end is refused here
 * instead of posting an unchanged list.
 */
export function canMove(length: number, from: number, to: number): boolean {
  return from !== to && from >= 0 && from < length && to >= 0 && to < length;
}

/** A copy of `links` with one link's per-agent `enabled` flag set. */
export function setLinkEnabled(links: readonly AgentSkillLink[], skillId: string, enabled: boolean): AgentSkillLink[] {
  return links.map((l) => (l.skill_id === skillId ? { ...l, enabled } : l));
}

/** A copy of `links` without the link to `skillId`. */
export function removeLink(links: readonly AgentSkillLink[], skillId: string): AgentSkillLink[] {
  return links.filter((l) => l.skill_id !== skillId);
}

/** The POST body's `skills`: the full ordered list with each link's flag. */
export function toLinkPayload(links: readonly AgentSkillLink[]): { skill_id: string; enabled: boolean }[] {
  return links.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled }));
}

/** `order` set to the array index, as the server will store it. */
export function renumber(links: readonly AgentSkillLink[]): AgentSkillLink[] {
  return links.map((l, i) => ({ ...l, order: i }));
}

/** Links that will load: checked on the link and enabled globally. */
export function countEnabledLinks(links: readonly AgentSkillLink[]): number {
  return links.filter((l) => l.enabled && l.skill_enabled).length;
}

/** Case-insensitive filter over a link's skill name. */
export function filterLinks(links: AgentSkillLink[], search: string): AgentSkillLink[] {
  const q = search.trim().toLowerCase();
  return q ? links.filter((l) => l.name.toLowerCase().includes(q)) : links;
}

/** Workspace skills not linked to the agent yet. */
export function unlinkedSkills(skills: readonly Skill[], links: readonly AgentSkillLink[]): Skill[] {
  const linked = new Set(links.map((l) => l.skill_id));
  return skills.filter((sk) => !linked.has(sk.id));
}

/** A new link for `skill`, appended (enabled) at the end. */
export function newLink(agentId: string, skill: Skill, order: number): AgentSkillLink {
  return {
    agent_id: agentId,
    skill_id: skill.id,
    order,
    enabled: true,
    name: skill.name,
    type: skill.type,
    skill_enabled: skill.enabled,
  };
}

/** How far a key press on a handle moves its row: Alt+↑ → -1, Alt+↓ → +1, else 0. */
export function moveDelta(key: string, altKey: boolean): number {
  return altKey ? (MOVE_KEYS[key] ?? 0) : 0;
}
