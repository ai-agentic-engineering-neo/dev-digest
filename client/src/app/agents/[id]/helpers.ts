import { DEFAULT_TAB, VALID_TABS, type AgentTab } from "./constants";

/** Whether `raw` names an agent editor tab. */
export function isAgentTab(raw: string | null | undefined): raw is AgentTab {
  return (VALID_TABS as readonly (string | null | undefined)[]).includes(raw);
}

/** The `?tab=` value as a known tab; anything else falls back to Config. */
export function parseAgentTab(raw: string | null | undefined): AgentTab {
  return isAgentTab(raw) ? raw : DEFAULT_TAB;
}
