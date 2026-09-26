/** skills — pure helpers (ring 2). Unit-testable without any double. */

/** A body edit that only changes surrounding whitespace is not a new version. */
export function isMeaningfulChange(previous: string, next: string): boolean {
  return previous.trim() !== next.trim();
}
