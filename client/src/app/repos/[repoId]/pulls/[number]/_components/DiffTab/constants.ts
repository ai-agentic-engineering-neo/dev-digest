/** Constants for DiffTab (Smart Order, L03). */
import type { Severity, SmartDiffRole } from "@devdigest/shared";

interface RoleMeta {
  /** i18n label key, under the `prReview` namespace. */
  labelKey: string;
  /** i18n description key, under the `prReview` namespace. */
  descKey: string;
  /** The group header's square color. Cosmetic — reuses existing CSS vars
      (`src/vendor/ui/styles.css`), no new severity-style palette. */
  color: string;
  /** Whether the role's group starts expanded. */
  defaultOpen: boolean;
}

/**
 * Everything the UI knows per Smart Diff role, in ONE record: adding a role to
 * the `SmartDiffRole` contract fails to compile until it has an entry here, and
 * a key cannot be listed twice. `SmartDiffRole` is imported as a type only — a
 * runtime import from `@devdigest/shared` breaks the Next.js build (its index
 * re-exports `./contracts/*.js`, which webpack cannot resolve to `.ts`).
 */
export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: { labelKey: "smartDiff.coreLabel", descKey: "smartDiff.coreDesc", color: "var(--accent)", defaultOpen: true },
  tests: { labelKey: "smartDiff.testsLabel", descKey: "smartDiff.testsDesc", color: "var(--ok)", defaultOpen: true },
  wiring: { labelKey: "smartDiff.wiringLabel", descKey: "smartDiff.wiringDesc", color: "var(--orange)", defaultOpen: true },
  docs: { labelKey: "smartDiff.docsLabel", descKey: "smartDiff.docsDesc", color: "var(--yellow)", defaultOpen: false },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    descKey: "smartDiff.boilerplateDesc",
    color: "var(--stale)",
    defaultOpen: false,
  },
};

/** Group display order = the key order of `ROLE_META` above (core → tests →
    wiring → docs → boilerplate, per the spec; `DiffTab.test.tsx` pins it). */
export const ROLE_ORDER = Object.keys(ROLE_META) as SmartDiffRole[];

/** Severity → the group header chip's i18n key ("{count} files with … findings"). */
export const SEVERITY_FILES_KEY: Record<Severity, string> = {
  CRITICAL: "smartDiff.filesWithSeverity.critical",
  WARNING: "smartDiff.filesWithSeverity.warning",
  SUGGESTION: "smartDiff.filesWithSeverity.suggestion",
};

/** Severities shown as group-header chips, in display order (no INFO chip —
    `Severity` has no INFO value; same precedent as `SeverityFilterBar/constants.ts`). */
export const CHIP_SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Severity → the one word the inline finding card leads with, under the
    `shell` namespace — the same words as the line badge (blocker / warning /
    suggestion), so the two never drift apart. */
export const SEVERITY_WORD_KEY: Record<Severity, string> = {
  CRITICAL: "diffViewer.findingLabel.critical",
  WARNING: "diffViewer.findingLabel.warning",
  SUGGESTION: "diffViewer.findingLabel.suggestion",
};
