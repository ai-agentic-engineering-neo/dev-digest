import type { AgentSkillLink, Skill, SkillType } from "@devdigest/shared";

export type SkillRow = {
  skill_id: string;
  name: string;
  type: SkillType;
  description: string;
  skill_enabled: boolean;
  enabled: boolean;
  linked: boolean;
};

export function mergeCatalogWithLinks(catalog: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(links.map((l) => [l.skill_id, l]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const skill = catalog.find((s) => s.id === l.skill_id);
      return {
        skill_id: l.skill_id,
        name: l.name || skill?.name || l.skill_id,
        type: l.type ?? skill?.type ?? "custom",
        description: l.description || skill?.description || "",
        skill_enabled: l.skill_enabled ?? skill?.enabled ?? true,
        enabled: l.enabled,
        linked: true,
      } satisfies SkillRow;
    });
  const leftover = catalog
    .filter((s) => !byId.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (s) =>
        ({
          skill_id: s.id,
          name: s.name,
          type: s.type,
          description: s.description,
          skill_enabled: s.enabled,
          enabled: false,
          linked: false,
        }) satisfies SkillRow,
    );
  return [...linked, ...leftover];
}

export function enabledCount(rows: SkillRow[]): { n: number; m: number } {
  return { n: rows.filter((r) => r.skill_enabled && r.enabled).length, m: rows.length };
}

export function filterSkillRows(rows: SkillRow[], q: string): SkillRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(needle));
}

export function toBindings(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return rows.filter((r) => r.linked).map((r) => ({ skill_id: r.skill_id, enabled: r.enabled }));
}

export function toggleRow(rows: SkillRow[], skillId: string, on: boolean): SkillRow[] {
  return rows.map((r) => {
    if (r.skill_id !== skillId) return r;
    if (on) return { ...r, linked: true, enabled: true };
    return { ...r, linked: true, enabled: false };
  });
}

export function canReorder(row: SkillRow): boolean {
  return row.linked && row.enabled && row.skill_enabled;
}

export function applyDrop(rows: SkillRow[], fromId: string, toId: string): SkillRow[] {
  if (fromId === toId) return rows;
  const from = rows.find((r) => r.skill_id === fromId);
  const to = rows.find((r) => r.skill_id === toId);
  if (!from || !to || !canReorder(from) || !canReorder(to)) return rows;
  const without = rows.filter((r) => r.skill_id !== fromId);
  const toIndex = without.findIndex((r) => r.skill_id === toId);
  if (toIndex < 0) return rows;
  return [...without.slice(0, toIndex), from, ...without.slice(toIndex)];
}
