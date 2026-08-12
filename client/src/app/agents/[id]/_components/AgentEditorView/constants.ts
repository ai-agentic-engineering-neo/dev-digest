/** Tabs the editor understands; anything else in ?tab= falls back to the first.
 *  Mirrors AgentEditor/constants.ts's TABS keys — that one drives the tab bar,
 *  this one guards the ?tab= param, and they drifted once already (skills). */
export const VALID_TABS = ["config", "skills", "context"] as const;
export const DEFAULT_TAB = VALID_TABS[0];
