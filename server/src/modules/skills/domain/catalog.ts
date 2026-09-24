/**
 * The community catalog as the domain sees it: vetted entries shipped with the
 * server (infrastructure/community-catalog.ts) and the pure search filter.
 */
import type { CommunitySkill, SkillType } from '@devdigest/shared';

/** A catalog entry = the listed card + the skill text it imports. */
export interface CatalogEntry extends CommunitySkill {
  /** Directive "when it applies" line (becomes the skill description). */
  description: string;
  body: string;
  type: SkillType;
}

export interface CatalogFilter {
  q?: string;
  tag?: string;
  lang?: string;
}

/** Case-insensitive search over name/desc/tags, exact tag + lang filters. */
export function filterCatalog<T extends CommunitySkill>(entries: readonly T[], f: CatalogFilter): T[] {
  const q = f.q?.trim().toLowerCase();
  const tag = f.tag?.trim().toLowerCase();
  const lang = f.lang?.trim().toLowerCase();
  return entries.filter((e) => {
    if (tag && !e.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (lang && e.lang.toLowerCase() !== lang) return false;
    if (!q) return true;
    return [e.name, e.desc, ...e.tags].some((s) => s.toLowerCase().includes(q));
  });
}

/** The card (no body) the list endpoint returns. */
export function toCommunityCard(e: CatalogEntry): CommunitySkill {
  return { id: e.id, name: e.name, repo: e.repo, stars: e.stars, lang: e.lang, desc: e.desc, type: e.type, tags: e.tags };
}
