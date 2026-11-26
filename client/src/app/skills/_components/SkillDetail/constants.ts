import type { IconName } from "@devdigest/ui";
import type { SkillTab } from "../constants";

/** Tab bar entries (labels: `skills.detail.tabs.*`). No Evals tab in M2 (SPEC §3.5). */
export const TAB_DEFS: readonly { key: SkillTab; icon: IconName }[] = [
  { key: "config", icon: "Settings" },
  { key: "preview", icon: "Eye" },
  { key: "stats", icon: "BarChart" },
  { key: "versions", icon: "History" },
];
