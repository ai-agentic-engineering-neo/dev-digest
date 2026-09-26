/**
 * Parse an HTTP `Retry-After` header into milliseconds.
 *
 * Accepts the delay-seconds form ("120") and the HTTP-date form
 * ("Wed, 21 Oct 2026 07:28:00 GMT"). Returns null for a missing header,
 * a negative or non-numeric delay, or a date in the past.
 */
export function parseRetryAfterMs(header: string | null | undefined, now: number = Date.now()): number | null {
  if (header == null) return null;
  const value = header.trim();
  if (value === '') return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (seconds < 0 || !Number.isFinite(seconds)) return null;
    return seconds * 1000;
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  if (at <= now) return null;
  return at - now;
}
