/* Conventions page constants (data only). Enum value lists are local copies —
   a runtime import from @devdigest/shared breaks the Next build (client/INSIGHTS). */
import type { ConventionCategory, ConventionStatus, SkillType } from "@devdigest/shared";

export const CONVENTION_CATEGORIES = [
  "naming",
  "structure",
  "errors",
  "imports",
  "typing",
  "testing",
  "api",
  "general",
] as const satisfies readonly ConventionCategory[];

export const STATUS_FILTERS = ["all", "pending", "accepted", "rejected"] as const satisfies readonly (
  | ConventionStatus
  | "all"
)[];
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SKILL_TYPES = ["rubric", "convention", "security", "custom"] as const satisfies readonly SkillType[];

/** Mirrors the server's SkillName contract (kebab-case, ≤ 64). */
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 200;
export const RULE_MAX = 300;

/** Ref used for GitHub links when a scan has no commit sha. */
export const FALLBACK_REF = "HEAD";

/** Stable keys for the loading placeholders (one per skeleton card). */
export const SKELETON_KEYS = ["skeleton-1", "skeleton-2", "skeleton-3"] as const;
