import { SEVERITY_ORDER } from "@/lib/severity";

/**
 * Read the `?severity=` filter off the URL.
 *
 * Anything unrecognised reads as "no filter": a hand-edited or stale link must
 * fall back to showing everything, never to an inexplicably empty page.
 */
export function parseSeverityParam(raw: string | null | undefined): string | null {
  return raw && raw in SEVERITY_ORDER ? raw : null;
}
