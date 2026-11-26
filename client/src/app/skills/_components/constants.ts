/** Skills feature constants (shared by the list, the detail pane and its tabs). */

import type { SkillType } from "@devdigest/shared";

/** Detail-pane tabs, in display order. The first one is the fallback for `?tab=`. */
export const SKILL_TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const DEFAULT_SKILL_TAB: SkillTab = "config";

/** Skill types in select order — mirrors the `SkillType` enum in `@devdigest/shared`.
    A local list, not `SkillType.options`: the client imports `@devdigest/shared`
    as types only, because Next's webpack can't resolve the barrel's `.js` re-exports. */
export const SKILL_TYPES = ["rubric", "convention", "security", "custom"] as const satisfies readonly SkillType[];

/** Field limits — mirror `SkillName` / `SkillBody` / `CreateSkillInput` /
    `UpdateSkillInput.message` in `@devdigest/shared` (contracts/knowledge.ts). */
export const SKILL_NAME_MAX = 64;
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_DESCRIPTION_MAX = 200;
export const SKILL_BODY_MAX = 20_000;
export const SKILL_MESSAGE_MAX = 120;

