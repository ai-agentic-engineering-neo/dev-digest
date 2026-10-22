import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Attached skill ids in prompt order. */
export function attachedIds(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/** Rows to show: attached skills first (prompt order), then the rest. */
export function orderSkills(skills: Skill[], attached: string[]): Skill[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const head = attached.flatMap((id) => byId.get(id) ?? []);
  const set = new Set(attached);
  return [...head, ...skills.filter((sk) => !set.has(sk.id))];
}

/** Toggle attachment: attaching appends to the end of the prompt order. */
export function toggleAttached(attached: string[], id: string, on: boolean): string[] {
  const rest = attached.filter((x) => x !== id);
  return on ? [...rest, id] : rest;
}

/** Move `dragged` to the position of `target` (both attached). */
export function moveBefore(attached: string[], dragged: string, target: string): string[] {
  if (dragged === target) return attached;
  const from = attached.indexOf(dragged);
  const to = attached.indexOf(target);
  if (from === -1 || to === -1) return attached;
  const next = [...attached];
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}

export function matchesFilter(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || skill.name.toLowerCase().includes(q) || skill.type.includes(q);
}
