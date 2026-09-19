import type { AgentSkillDetail } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + type. Order is untouched —
 *  filtering never reorders, it only hides rows. */
export function filterSkills(skills: AgentSkillDetail[], query: string): AgentSkillDetail[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.type}`.toLowerCase().includes(q));
}

/** Move the skill one slot up (-1) or down (+1) in the FULL ordered list.
 *  Returns undefined at either boundary or an unknown id — nothing to submit. */
export function moveSkill(
  skills: AgentSkillDetail[],
  id: string,
  direction: -1 | 1,
): AgentSkillDetail[] | undefined {
  const from = skills.findIndex((sk) => sk.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= skills.length) return undefined;
  const next = skills.slice();
  const moved = next[from];
  if (!moved) return undefined;
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move `draggedId` to just before `targetId` in the FULL ordered list
 *  (native HTML5 drag-and-drop, the ↑/↓ buttons' pointer-driven sibling). */
export function reorderByDrag(
  skills: AgentSkillDetail[],
  draggedId: string,
  targetId: string,
): AgentSkillDetail[] | undefined {
  if (draggedId === targetId) return undefined;
  const from = skills.findIndex((sk) => sk.id === draggedId);
  if (from < 0) return undefined;
  const next = skills.slice();
  const moved = next[from];
  if (!moved) return undefined;
  next.splice(from, 1);
  const to = next.findIndex((sk) => sk.id === targetId);
  next.splice(to < 0 ? next.length : to, 0, moved);
  return next;
}
