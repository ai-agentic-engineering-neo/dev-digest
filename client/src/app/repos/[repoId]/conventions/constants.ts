import type { ConventionCategory } from "@devdigest/shared";

/**
 * Every category the inline editor offers.
 *
 * Written out rather than read off the `ConventionCategory` zod enum: the
 * client's vendored `@devdigest/shared` is a TYPE-only dependency here — its
 * barrel re-exports with `.js` specifiers that Next's bundler cannot resolve
 * against the `.ts` sources, so a value import type-checks, passes vitest, and
 * then fails `next build`. The exhaustiveness guard below is what keeps the
 * list honest instead.
 */
const CATEGORY_VALUES = [
  "naming",
  "structure",
  "imports",
  "types",
  "async",
  "error-handling",
  "api",
  "testing",
  "logging",
  "other",
] as const;

/** Compile error the day the contract gains a category this select does not offer. */
type MissingCategory = Exclude<ConventionCategory, (typeof CATEGORY_VALUES)[number]>;
const _exhaustive: MissingCategory extends never ? true : never = true;
void _exhaustive;

export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = CATEGORY_VALUES;

/** Skeleton cards shown while a scan runs. */
export const SCANNING_SKELETON_CARDS = 3;
