import type { SmartDiffRole } from "@/lib/types";

/** Display order of the role groups (core first, boilerplate last). */
export const SMART_DIFF_GROUP_ORDER: readonly SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Roles whose files start collapsed regardless of size. */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

export const GROUP_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--viz-1)",
  tests: "var(--viz-5)",
  wiring: "var(--viz-4)",
  docs: "var(--viz-3)",
  boilerplate: "var(--text-muted)",
};

/** Keys under the `prReview.smartDiff` message namespace. */
export const GROUP_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};

export const GROUP_DESCRIPTION_KEY: Record<SmartDiffRole, string> = {
  core: "coreDescription",
  tests: "testsDescription",
  wiring: "wiringDescription",
  docs: "docsDescription",
  boilerplate: "boilerplateDescription",
};
