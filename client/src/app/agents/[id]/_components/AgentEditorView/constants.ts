/** Editor tabs reachable via ?tab=. Unknown values fall back to the first. */
export const VALID_TABS = ["config", "skills"] as const;
export const DEFAULT_TAB = VALID_TABS[0];
