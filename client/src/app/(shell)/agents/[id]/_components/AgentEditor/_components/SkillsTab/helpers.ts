import type { AgentSkillItem } from "@devdigest/shared";

/** Case-insensitive filter over a row's name + description (display only —
   reordering/toggling always operate on the full, unfiltered list). */
export function filterItems(items: AgentSkillItem[], search: string): AgentSkillItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(q));
}

/** Re-derives `linked`/`order` from a desired ordering of LINKED skill ids:
   those ids become `linked:true` with `order` = their 1-based position;
   everything else becomes `linked:false, enabled:false, order:null`. Pure —
   the seam this feature's tests target. */
function withLinkedOrder(items: AgentSkillItem[], linkedIdsInOrder: string[]): AgentSkillItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const linkedSet = new Set(linkedIdsInOrder);
  const linked = linkedIdsInOrder.map((id, idx) => ({ ...byId.get(id)!, linked: true, order: idx + 1 }));
  const rest = items
    .filter((i) => !linkedSet.has(i.id))
    .map((i) => ({ ...i, linked: false, enabled: false, order: null }));
  return [...linked, ...rest];
}

/** Checking a row attaches it (appended at the end of the linked order) and
   enables it; unchecking detaches it. */
export function toggleLinked(items: AgentSkillItem[], skillId: string, checked: boolean): AgentSkillItem[] {
  const linkedIds = items.filter((i) => i.linked).map((i) => i.id);
  if (checked) {
    if (!linkedIds.includes(skillId)) linkedIds.push(skillId);
  } else {
    const idx = linkedIds.indexOf(skillId);
    if (idx >= 0) linkedIds.splice(idx, 1);
  }
  return withLinkedOrder(items, linkedIds).map((i) => (i.id === skillId ? { ...i, enabled: checked } : i));
}

/** Drag-and-drop reorder: move `fromId` to just before `toId` among the
   linked rows. A no-op (returns `items` unchanged) if either id is not
   currently linked. */
export function reorderLinked(items: AgentSkillItem[], fromId: string, toId: string): AgentSkillItem[] {
  const linkedIds = items.filter((i) => i.linked).map((i) => i.id);
  const from = linkedIds.indexOf(fromId);
  const to = linkedIds.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return items;
  linkedIds.splice(from, 1);
  linkedIds.splice(to, 0, fromId);
  return withLinkedOrder(items, linkedIds);
}

/** Keyboard ↑/↓ reorder: swap a linked row with its neighbour. A no-op at
   either end of the linked list. */
export function moveLinked(items: AgentSkillItem[], skillId: string, dir: -1 | 1): AgentSkillItem[] {
  const linkedIds = items.filter((i) => i.linked).map((i) => i.id);
  const idx = linkedIds.indexOf(skillId);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= linkedIds.length) return items;
  const tmp = linkedIds[idx]!;
  linkedIds[idx] = linkedIds[next]!;
  linkedIds[next] = tmp;
  return withLinkedOrder(items, linkedIds);
}
