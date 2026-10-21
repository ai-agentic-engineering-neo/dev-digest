import type { ConventionCategory } from "@devdigest/shared";

/**
 * Selectable categories for the inline editor. Mirrors the `ConventionCategory`
 * enum in @devdigest/shared as a plain list: the client must not import
 * runtime values from the shared barrel (its `.js` specifiers do not bundle).
 */
export const CATEGORY_VALUES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "async",
  "error-handling",
  "api",
  "testing",
  "style",
  "security",
  "other",
];
