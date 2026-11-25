import { isUuid } from "@/lib/ids";

/**
 * The `?trace=` value from the URL, or null when it isn't a run id (a uuid).
 * The value is user-controlled (a shared link) and ends up in an API path.
 */
export function parseTraceRunId(raw: string | null): string | null {
  return isUuid(raw) ? raw : null;
}
