/** Run ids are Postgres uuids (agent_runs.id). */
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `?trace=` value from the URL, or null when it isn't a run id. The value
 * is user-controlled (a shared link) and ends up in an API path, so anything
 * that isn't a uuid never reaches the trace request.
 */
export function parseTraceRunId(raw: string | null): string | null {
  return raw && RUN_ID_RE.test(raw) ? raw : null;
}
