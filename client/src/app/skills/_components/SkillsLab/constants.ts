/** Constants for the Skills Lab (master-detail) view. */
import type { IconName } from "@devdigest/ui";

/** Skeleton cards while the list loads. */
export const SKELETON_CARDS = 4;

/** Detail-panel tabs, in design order. `config` is the default. */
export const TAB_KEYS = ["config", "preview", "evals", "stats", "versions"] as const;
export type SkillTab = (typeof TAB_KEYS)[number];
export const DEFAULT_TAB: SkillTab = "config";

/** Tab icons (video design: gear · eye · flask · chart · clock). */
export const TAB_ICONS: Record<SkillTab, IconName> = {
  config: "Settings",
  preview: "Eye",
  evals: "FlaskConical",
  stats: "BarChart",
  versions: "History",
};

/** Max chars of the "What changed?" version note (server caps at 200). */
export const MAX_NOTE_CHARS = 200;
