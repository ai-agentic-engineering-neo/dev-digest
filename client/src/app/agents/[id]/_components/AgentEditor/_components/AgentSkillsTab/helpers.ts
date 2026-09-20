import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { estimateTokens } from "@/lib/skills";

/** Moves `id` one step up (-1) or down (+1). Out-of-range moves return the same order. */
export function moveById(ids: readonly string[], id: string, dir: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Drag-and-drop: places `id` at the position currently held by `targetId`. */
export function moveToTarget(ids: readonly string[], id: string, targetId: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export interface LinkedSkill {
  link: AgentSkillLink;
  skill: Skill;
}

/** Joins links (ordered) with their skills; links whose skill is unknown are dropped. */
export function joinLinks(links: readonly AgentSkillLink[], skills: readonly Skill[]): LinkedSkill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((link) => {
      const skill = byId.get(link.skill_id);
      return skill ? [{ link, skill }] : [];
    });
}

/** Tokens the agent's enabled skills add to the prompt (link AND skill both enabled). */
export function enabledTokens(rows: readonly LinkedSkill[]): number {
  return rows
    .filter((r) => r.link.enabled && r.skill.enabled)
    .reduce((sum, r) => sum + estimateTokens(r.skill.body), 0);
}
