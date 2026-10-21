import type { SmartDiffRole } from "@devdigest/shared";

/** Presentation per role (classification itself stays on the server). */
export const ROLE_META = {
  core: { labelKey: "coreLabel", captionKey: "coreCaption", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", captionKey: "testsCaption", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", captionKey: "wiringCaption", color: "var(--warn)" },
  docs: { labelKey: "docsLabel", captionKey: "docsCaption", color: "var(--info)" },
  boilerplate: { labelKey: "boilerplateLabel", captionKey: "boilerplateCaption", color: "var(--text-muted)" },
} as const satisfies Record<SmartDiffRole, { labelKey: string; captionKey: string; color: string }>;

/** Roles that start collapsed: skim material. */
export const DEFAULT_COLLAPSED: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);
