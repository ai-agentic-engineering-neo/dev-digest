import { DEFAULT_TAB, VALID_TABS } from "./constants";

/** Normalize a raw ?tab= value (missing, repeated or unknown → the default tab). */
export function resolveTab(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && VALID_TABS.includes(value) ? value : DEFAULT_TAB;
}

/** Editor URL for an agent on a given tab. */
export function agentHref(id: string, tab: string): string {
  return `/agents/${encodeURIComponent(id)}?${new URLSearchParams({ tab }).toString()}`;
}
