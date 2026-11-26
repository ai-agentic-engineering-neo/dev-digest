/* Pure helpers for the skill Stats tab (no React, no i18n). */
import { NO_VALUE } from "@/lib/format";
import { ACCEPT_FAIR_MIN, ACCEPT_GOOD_MIN, type AcceptTone } from "./constants";

/** Accept rate 0–1 → "67%"; `null` (nothing decided) → "—". */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return NO_VALUE;
  return `${Math.round(rate * 100)}%`;
}

/** Colour band of an accept rate: ≥60% good · 40–59% fair · <40% poor · null none. */
export function acceptTone(rate: number | null | undefined): AcceptTone {
  if (rate == null || !Number.isFinite(rate)) return "none";
  if (rate >= ACCEPT_GOOD_MIN) return "good";
  if (rate >= ACCEPT_FAIR_MIN) return "fair";
  return "poor";
}

/** ISO timestamp → `YYYY-MM-DD` (UTC); "—" when unparsable. */
export function formatDay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return NO_VALUE;
  return new Date(ms).toISOString().slice(0, 10);
}

// Moved to lib/format (shared with the Conventions page); re-exported for existing importers.
export { formatRelative } from "@/lib/format";

/** Link to the agent's Skills tab. */
export function agentSkillsHref(agentId: string): string {
  return `/agents/${encodeURIComponent(agentId)}?tab=skills`;
}
