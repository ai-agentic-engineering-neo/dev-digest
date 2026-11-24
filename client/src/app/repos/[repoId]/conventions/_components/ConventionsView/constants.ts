/** Confidence thresholds (match ConfidenceNum in the UI kit). */
export const CONF_OK = 0.85;
export const CONF_WARN = 0.65;
export const SKELETON_CARDS = 3;

/** Generated skill text. This is skill content (model-facing), not UI copy. */
export const SKILL_INTRO =
  "Flag changes that violate any rule below and cite the offending `file:line`.";
export const SKILL_DESCRIPTION_TEMPLATE =
  "Apply when a diff touches {repo} code; check it follows the house conventions below.";
export const RULE_SLUG_WORDS = 5;
