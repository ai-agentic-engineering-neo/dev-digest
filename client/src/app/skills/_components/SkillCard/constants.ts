import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon shown next to the source label on a card. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "ExternalLink",
  extracted: "ListChecks",
  community: "Globe",
};
