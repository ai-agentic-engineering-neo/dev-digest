/** Tabs the editor understands; anything else in ?tab= falls back to the first. */
export const VALID_TABS = ["config"] as const;
export const DEFAULT_TAB = VALID_TABS[0];
