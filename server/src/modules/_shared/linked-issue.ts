import type { GitHubClient, IssueMeta, RepoRef } from '@devdigest/shared';

/**
 * Ticket/spec reference parsing, shared by `adapters/github/octokit.ts`
 * (feeding `PrDetail.linked_issue` for `modules/pulls/routes.ts`) and
 * `modules/intent/` (both need "what does this PR's title/body reference").
 * Pure regexes — no I/O — plus one best-effort fetch helper. See
 * specs/05-intent-layer.md's API section for why this lives in `_shared`
 * rather than either consuming module.
 */

/** "closes #12" / "fixes #7" / "resolved #3" (case-insensitive), else a bare "#3". */
const CLOSES_RE = /\b(?:clos(?:e|es|ed)|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i;
const BARE_ISSUE_RE = /#(\d+)\b/;

/** Extract the first referenced issue number from free text, or `null`. */
export function parseIssueNumber(text: string): number | null {
  const closes = CLOSES_RE.exec(text);
  if (closes?.[1]) return Number(closes[1]);
  const bare = BARE_ISSUE_RE.exec(text);
  return bare?.[1] ? Number(bare[1]) : null;
}

/** An in-repo spec path like `specs/05-intent-layer.md`. */
const SPEC_REF_RE = /\bspecs\/\d+-[\w-]+\.md\b/;

/** Extract the first referenced in-repo spec path from free text, or `null`. */
export function parseSpecRef(text: string): string | null {
  return SPEC_REF_RE.exec(text)?.[0] ?? null;
}

/**
 * Regex + fetch pair: parse a ticket reference out of title/body, then
 * best-effort fetch it. Never throws — no reference, a fetch failure, or an
 * unavailable GitHub client all resolve to `null` (offline-degrades, same
 * posture as the rest of the pulls/intent read paths).
 */
export async function resolveLinkedIssue(
  github: GitHubClient,
  repo: RepoRef,
  title: string,
  body: string | null,
): Promise<IssueMeta | null> {
  const n = parseIssueNumber(`${title}\n${body ?? ''}`);
  if (n == null) return null;
  try {
    return await github.getIssue(repo, n);
  } catch {
    return null;
  }
}
