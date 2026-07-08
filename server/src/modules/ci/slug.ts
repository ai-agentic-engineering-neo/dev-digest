/**
 * Deterministic, filesystem-safe slug generation for CI export.
 *
 * Slugs are DERIVED from the agent/skill name at export time — they are never
 * persisted (decision Q6). Re-exporting the same name always yields the same
 * base slug; collisions against a caller-supplied set of already-used slugs
 * are disambiguated deterministically with a numeric suffix (`-2`, `-3`, …).
 */

/** Filesystem-safe slug shape required by the on-disk `.devdigest/` layout. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Used when a name normalizes to nothing usable (e.g. all-punctuation names). */
const FALLBACK_SLUG = 'agent';

/**
 * Normalize an arbitrary display name into a slug matching `SLUG_PATTERN`.
 * Pure and stable: the same input always produces the same output.
 */
export function slugify(name: string): string {
  const normalized = name
    .normalize('NFKD')
    // Strip diacritics (combining marks) left behind by NFKD decomposition.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Any run of characters outside [a-z0-9] becomes a single hyphen.
    .replace(/[^a-z0-9]+/g, '-')
    // Trim leading/trailing hyphens.
    .replace(/^-+|-+$/g, '');

  if (normalized.length === 0) {
    return FALLBACK_SLUG;
  }

  // SLUG_PATTERN requires the first character to be alphanumeric (not '-').
  // The trim above already guarantees no leading/trailing hyphen, so
  // `normalized` already satisfies the pattern — this is a defensive assertion.
  return SLUG_PATTERN.test(normalized) ? normalized : FALLBACK_SLUG;
}

/**
 * Deterministically disambiguate `baseSlug` against a set of slugs already in
 * use (e.g. other agents/skills exported into the same repo). Returns
 * `baseSlug` unchanged if it is free, otherwise the smallest `-N` (N >= 2)
 * suffix that is not in `usedSlugs`.
 */
export function disambiguateSlug(baseSlug: string, usedSlugs: Iterable<string>): string {
  const used = usedSlugs instanceof Set ? usedSlugs : new Set(usedSlugs);
  if (!used.has(baseSlug)) {
    return baseSlug;
  }
  let suffix = 2;
  let candidate = `${baseSlug}-${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
  return candidate;
}

/** Convenience: slugify a name and disambiguate it against already-used slugs in one call. */
export function slugFromName(name: string, usedSlugs: Iterable<string> = []): string {
  return disambiguateSlug(slugify(name), usedSlugs);
}
