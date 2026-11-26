import type { SkillSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Provenance label icon per source (labels: `skills.listItem.source.*`). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Code",
  community: "Users",
  imported_url: "Link",
};
