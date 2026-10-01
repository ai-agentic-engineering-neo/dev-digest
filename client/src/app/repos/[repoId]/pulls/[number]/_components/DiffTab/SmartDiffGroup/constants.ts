import type { SmartDiffRole } from "@devdigest/shared";

export const DEFAULT_COLLAPSED_ROLES: SmartDiffRole[] = ["docs", "boilerplate"];

/** i18n keys (prReview.smartDiff.*) + colour token per role. */
export const ROLE_META: Record<
  SmartDiffRole,
  { labelKey: string; descriptionKey: string; color: string }
> = {
  core: { labelKey: "coreLabel", descriptionKey: "coreDescription", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", descriptionKey: "testsDescription", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", descriptionKey: "wiringDescription", color: "var(--warn)" },
  docs: { labelKey: "docsLabel", descriptionKey: "docsDescription", color: "var(--text-muted)" },
  boilerplate: {
    labelKey: "boilerplateLabel",
    descriptionKey: "boilerplateDescription",
    color: "var(--border-strong)",
  },
};
