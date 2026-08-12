/** Constants for the Run Trace + Live Log drawer (A5). */
import type { SpecReadStatus } from "@devdigest/shared";

/** Drawer width (px). */
export const DRAWER_WIDTH = 720;

/** Live-log stream viewport height (px). */
export const LOG_HEIGHT = 420;

/** Tab keys (Trace / Live log). */
export const TABS = ["trace", "log"] as const;
export type TraceTab = (typeof TABS)[number];

/** Prompt-assembly block accent colours (by leg). */
export const PROMPT_COLORS = {
  system: "var(--text-muted)",
  skills: "var(--accent)",
  memory: "var(--warn)",
  repoMap: "var(--accent)",
  specs: "var(--text-secondary)",
  callers: "var(--warn)",
  intent: "var(--accent)",
  // Revision 2 (specs/05-intent-layer.md) — distinct accent from `intent`
  // above so the two intent-related blocks are visually distinguishable.
  intentScope: "var(--ok)",
  user: "var(--ok)",
} as const;

/**
 * specs/09-project-context-folder.md — one badge color per `SpecRead.status`
 * (AC-18/AC-32/AC-33/AC-36). Sibling to `PROMPT_COLORS` above, not a reuse of
 * it: `specs_read` is a Configuration-section list, not a prompt-assembly
 * block, so it needs its own explicit JSX + color entries per
 * `client/LEARNINGS.md`'s "TraceBody renders nothing generically" rule.
 */
export const SPEC_STATUS_COLORS: Record<SpecReadStatus, { color: string; bg: string }> = {
  included: { color: "var(--ok)", bg: "var(--ok-bg)" },
  omitted: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  refused: { color: "var(--crit)", bg: "var(--crit-bg)" },
  dropped: { color: "var(--warn)", bg: "var(--warn-bg)" },
};
