/** Constants shared by the /skills routes. */

/** Detail-pane tabs, in display order; the active one lives in `?tab=`. */
export const VALID_TABS = ["config", "context", "preview", "evals", "stats", "versions"] as const;

export type SkillTab = (typeof VALID_TABS)[number];

/** Tab shown when `?tab=` is missing or unknown. */
export const DEFAULT_TAB: SkillTab = "config";

/** Width of the create and import skill modals (px). */
export const SKILL_FORM_MODAL_WIDTH = 760;

/** A new skill's form before the user types anything. */
export const EMPTY_DRAFT = { name: "", description: "", type: "custom", body: "" } as const;
