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

/**
 * Spec-shaped in-repo markdown paths. Deliberately PERMISSIVE: these produce
 * CANDIDATES only and never decide which document governs a PR, so
 * over-matching is cheap while under-matching is not. The previous version
 * (`/\bspecs\/\d+-[\w-]+\.md\b/`) encoded DevDigest's own `specs/05-name.md`
 * convention and silently matched nothing in repos naming specs any other way
 * (e.g. `docs/specs/analytics-dashboard-spec.md`), leaving both the intent
 * classifier and the Why+Risk brief with no spec AND no gap reported.
 *
 * Two shapes are recognised: any `.md` under a spec-ish directory segment at
 * any depth, and any `.md` whose basename ends in `-spec`/`-requirements`.
 *
 * A match here is only a candidate. It MUST be membership-checked against the
 * real changed-file set and containment-checked before any read
 * (`resolveContainedPath`) — these regexes are not a security boundary.
 */
const SPEC_DIR_RE = /(?:[\w.-]+\/)*(?:specs?|requirements)\/(?:[\w.-]+\/)*[\w.-]+\.md\b/g;
const SPEC_NAME_RE = /(?:[\w.-]+\/)*[\w.-]*[-_](?:spec|requirements)\.md\b/g;

/** An explicit `Spec: <path>` line — the strongest signal, because the author
 *  named the document deliberately rather than merely mentioning a file. */
const SPEC_LABEL_RE = /^[ \t]*spec\s*:\s*(\S+\.md)\b/gim;

/** Text that discusses a specification without yielding a usable path (e.g.
 *  "see the spec", a `Spec:` line whose path is broken). Used ONLY to report a
 *  context gap — never to select a document. */
const SPEC_MENTION_RE = /\b(?:specification|spec|acceptance criteria|AC-\d+\.\d+)\b/i;

function matchAll(re: RegExp, text: string): string[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => (m[1] ?? m[0]).trim());
}

/**
 * Every spec-shaped path referenced by `text`, most-authoritative first: an
 * explicit `Spec:` line, then a directory-shaped mention, then a name-shaped
 * one. De-duplicated, order preserved.
 */
export function parseSpecRefs(text: string): string[] {
  const ordered = [
    ...matchAll(SPEC_LABEL_RE, text),
    ...matchAll(SPEC_DIR_RE, text),
    ...matchAll(SPEC_NAME_RE, text),
  ];
  return [...new Set(ordered)];
}

/** Back-compatible single-value form: the most authoritative referenced spec
 *  path, or `null`. Callers able to rank against real repo paths should prefer
 *  `collectSpecCandidates`. */
export function parseSpecRef(text: string): string | null {
  return parseSpecRefs(text)[0] ?? null;
}

/** Whether one concrete repo path looks like a specification document. */
export function isSpecShapedPath(path: string): boolean {
  return matchAll(SPEC_DIR_RE, path).length > 0 || matchAll(SPEC_NAME_RE, path).length > 0;
}

/**
 * True when `text` clearly discusses a specification but no usable path came
 * out of it. This is the case that used to fail SILENTLY: no path parsed meant
 * no gap reported, so nobody learned the spec never reached the prompt.
 */
export function mentionsSpecWithoutPath(text: string): boolean {
  return parseSpecRefs(text).length === 0 && SPEC_MENTION_RE.test(text);
}

/**
 * Ranked spec candidates for one PR: paths the author referenced in free text
 * first, then spec-shaped files the PR itself changes — a document added or
 * edited by a PR almost always governs it, and that source was previously not
 * consulted at all.
 *
 * Text-sourced paths are NOT trusted on their own: one is kept only if it also
 * names a real changed file, so an injected `../../../etc/passwd` never becomes
 * a candidate. Containment checking at read time still applies.
 */
export function collectSpecCandidates(text: string, changedPaths: readonly string[]): string[] {
  const changed = new Set(changedPaths);
  const fromText = parseSpecRefs(text).filter((p) => changed.has(p));
  const fromDiff = changedPaths.filter((p) => isSpecShapedPath(p));
  return [...new Set([...fromText, ...fromDiff])];
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
