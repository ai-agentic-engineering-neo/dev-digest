import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Detail tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * The four tabs backed by real data. The design also sketches an "Evals" tab;
 * it is intentionally absent — eval cases are a separate feature and a tab that
 * invents numbers is worse than a tab that is not there.
 */
export const SKILL_TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

/** Valid `?tab=` values for this route. */
export const SKILL_TAB_KEYS = SKILL_TABS.map((t) => t.key);

/**
 * Every value the `type` select offers.
 *
 * Written out rather than taken from the `SkillType` zod enum on purpose: the
 * client's vendored `@devdigest/shared` is a TYPE-only dependency here — its
 * barrel re-exports with `.js` specifiers that Next's bundler cannot resolve
 * against the `.ts` sources, so a value import type-checks, passes vitest, and
 * then fails `next build`. The guard below is what keeps the list honest.
 */
const SKILL_TYPE_VALUES = ["rubric", "convention", "security", "custom"] as const;

/** Compile error the day the contract gains a type this select does not offer. */
type MissingSkillType = Exclude<SkillType, (typeof SKILL_TYPE_VALUES)[number]>;
const _exhaustive: MissingSkillType extends never ? true : never = true;
void _exhaustive;

export const SKILL_TYPES: readonly SkillType[] = SKILL_TYPE_VALUES;
