import type { SkillListStats } from "@devdigest/shared";

/** One footer segment: a label already resolved through i18n. */
export type FooterKey = "agents" | "pull" | "accept";

export interface FooterSegment {
  key: FooterKey;
  /** `agents` carries a count, the two percentages carry a rounded percent. */
  value: number;
}

/**
 * Which footer segments a rail card may render.
 *
 * `pull_pct` / `accept_pct` are `null` when nothing has been measured yet, and
 * a card must then collapse to just the agent count rather than printing
 * `0% pull` — an unused skill and a rejected one must not look identical.
 */
export function footerSegments(stats: SkillListStats): FooterSegment[] {
  const out: FooterSegment[] = [{ key: "agents", value: stats.used_by }];
  if (stats.pull_pct != null) out.push({ key: "pull", value: Math.round(stats.pull_pct) });
  if (stats.accept_pct != null) out.push({ key: "accept", value: Math.round(stats.accept_pct) });
  return out;
}
