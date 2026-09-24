import type { CreatableSkillSource } from "@devdigest/shared";

/** Source label key (skills.importPreview.*) per import kind. */
export const SOURCE_LABEL_KEY: Record<CreatableSkillSource, string> = {
  imported_file: "importPreview.sourceFile",
  imported_url: "importPreview.sourceUrl",
  community: "importPreview.sourceCommunity",
  manual: "importPreview.sourceFile",
};

/** Ignored-file reasons with their own copy (skills.importPreview.reason.*). */
export const KNOWN_IGNORE_REASONS = ["executable", "not_markdown", "reference_doc", "too_large"] as const;
