/* Constants for the Smart Diff tab (server/specs/06-smart-diff.md). */
import type { SmartDiffRole } from "@devdigest/shared";

/** Docs and boilerplate start collapsed; the rest follow AUTO_EXPAND_MAX_LINES. */
export const DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

/** prReview.json `smartDiff.*` label key per role. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

/** prReview.json `smartDiff.*` one-line hint key per role. */
export const ROLE_HINT_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreHint",
  tests: "smartDiff.testsHint",
  wiring: "smartDiff.wiringHint",
  docs: "smartDiff.docsHint",
  boilerplate: "smartDiff.boilerplateHint",
};

/** Role accent (the header dot + collapsed-group border) — existing design
 *  tokens only, no new palette (client/INSIGHTS.md). */
export const ROLE_CSS_VAR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "var(--info)",
  boilerplate: "var(--text-muted)",
};

/** The Smart/Original order toggle — a local, structurally-compatible mirror
 *  of PrDetailView's URL-backed DiffOrder (kept separate: DiffTab doesn't
 *  reach into a sibling feature's constants). */
export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];
