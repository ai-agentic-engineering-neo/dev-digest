/* lib/ids.ts — ids that come from the URL (route params, query string) are
   user-controlled and end up in API paths. Every such id is a Postgres uuid,
   so it must match before it reaches fetch: encodeURIComponent alone would keep
   a bare ".." segment, which fetch then normalises (/repos/../pulls → /pulls). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `id` is a uuid (repos.id, agent_runs.id, …). */
export function isUuid(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** `/repos/<id>` for API calls; throws on a non-uuid id so it never becomes a path. */
export function repoPath(repoId: string | null | undefined): string {
  if (!isUuid(repoId)) throw new Error("Invalid repository id");
  return `/repos/${encodeURIComponent(repoId)}`;
}
