/** Constants for the Skills Lab (master-detail) view. */

/** Skeleton cards while the list loads. */
export const SKELETON_CARDS = 4;

/** Detail-panel tabs, in design order. `config` is the default. */
export const TAB_KEYS = ["config", "preview", "evals", "stats", "versions"] as const;
export type SkillTab = (typeof TAB_KEYS)[number];
export const DEFAULT_TAB: SkillTab = "config";

/** Same rule as the server (modules/_shared/skill-name.ts → SKILL_NAME_PATTERN). */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Max chars of the "What changed?" version note (server caps at 200). */
export const MAX_NOTE_CHARS = 200;
