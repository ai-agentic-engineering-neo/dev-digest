/** Skill editor tabs reachable via ?tab=. Unknown values fall back to the first. */
export const VALID_TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof VALID_TABS)[number];
export const DEFAULT_TAB: SkillTab = "config";

export function isValidTab(tab: string | null): tab is SkillTab {
  return (VALID_TABS as readonly string[]).includes(tab ?? "");
}
