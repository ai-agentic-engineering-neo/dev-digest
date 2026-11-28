/* toast-dedupe.ts — drop a toast identical to one shown moments ago, so one
   failure reported from two places (or by a repeating poll / SSE error) shows once. */

/** Identical toasts (same kind and text) within this window are shown once. */
export const TOAST_DEDUPE_MS = 4000;

/** Returns `accept(kind, message)`: true when the toast should be shown. */
export function createToastDeduper(windowMs = TOAST_DEDUPE_MS, now: () => number = Date.now) {
  const lastShown = new Map<string, number>();
  return (kind: string, message: string): boolean => {
    const key = `${kind}\u0000${message}`;
    const t = now();
    const prev = lastShown.get(key);
    if (prev !== undefined && t - prev < windowMs) return false;
    // Forget toasts older than the window so the map stays small.
    for (const [k, shownAt] of lastShown) {
      if (t - shownAt >= windowMs) lastShown.delete(k);
    }
    lastShown.set(key, t);
    return true;
  };
}
