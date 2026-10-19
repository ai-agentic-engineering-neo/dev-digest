import type { ConventionCategory } from "@devdigest/shared";

/**
 * Categories in contract order (`ConventionCategory` in vendor/shared). The
 * client imports only TYPES from @devdigest/shared — Next can't resolve the
 * contracts' `.js` re-exports at runtime — so the list is mirrored here; the
 * `satisfies` + exhaustive record below fail typecheck if the enum drifts.
 */
const ORDER = {
  naming: 0,
  "error-handling": 1,
  structure: 2,
  imports: 3,
  typing: 4,
  testing: 5,
  style: 6,
  other: 7,
} satisfies Record<ConventionCategory, number>;

export const CONVENTION_CATEGORIES = Object.keys(ORDER) as ConventionCategory[];
