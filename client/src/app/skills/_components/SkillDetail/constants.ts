import type { IconName } from "@devdigest/ui";
import type { SkillTab } from "../../constants";

/** Message keys under `skills.future`, one per tab that is only an empty state in M2. */
export type FutureTabMessageKey = "context" | "evals" | "stats";

/** Tabs that only show an empty state naming their milestone in M2. */
export const FUTURE_TABS: Partial<Record<SkillTab, { icon: IconName; messageKey: FutureTabMessageKey }>> = {
  context: { icon: "Folder", messageKey: "context" },
  evals: { icon: "FlaskConical", messageKey: "evals" },
  stats: { icon: "BarChart", messageKey: "stats" },
};

/** The content fields a draft edits, compared field by field to find changes. */
export const DRAFT_FIELDS = ["name", "description", "type", "body"] as const;

/** HTTP status of a skill that does not exist (deleted, or a bad id in the URL). */
export const NOT_FOUND_STATUS = 404;
