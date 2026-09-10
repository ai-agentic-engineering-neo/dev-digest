import { TABS } from "../AgentEditor/constants";

/** Tabs the editor understands; anything else in ?tab= falls back to the first.
 *  Derived from AgentEditor/constants.ts's TABS — the single list that drives
 *  the tab bar — so the ?tab= guard can no longer drift behind a newly added
 *  tab, as it did for `skills` and again for `ci`. */
export const VALID_TABS = TABS.map((t) => t.key);
export const DEFAULT_TAB = VALID_TABS[0] ?? "config";
