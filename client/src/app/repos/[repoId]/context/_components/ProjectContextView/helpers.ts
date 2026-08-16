/** Split the roots editor's one-per-line textarea into a clean root list —
 *  trims whitespace and drops blank lines. Server-side validation (relative,
 *  `..`-free, non-absolute — AC-27) is the actual gate; this only shapes the
 *  input, it never decides safety. */
export function parseRootsInput(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Inverse of `parseRootsInput`, for seeding the textarea from the roots the
 *  last scan actually used. */
export function rootsToInput(roots: string[]): string {
  return roots.join("\n");
}

/** Path substring match for the list's filter box — client-side only, never
 *  changes what discovery found or what's attached (AC-35's view-only rule). */
export function matchesFilter(path: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return path.toLowerCase().includes(needle);
}
