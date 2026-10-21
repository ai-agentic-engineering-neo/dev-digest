/**
 * reviews: pure helpers for PR intent (ring 2, no I/O): reference extraction,
 * path normalisation, confidence, budget, cache hash, basis. Everything that
 * reads text from a PR treats it as untrusted; all patterns are linear-bounded
 * (no nested unbounded quantifiers) and run on length-capped input.
 */
import type { IntentConfidence, IntentSource } from '@devdigest/shared';
import {
  INTENT_BODY_CHARS,
  INTENT_DOC_EXTENSIONS,
  INTENT_MAX_DOCS,
  INTENT_MAX_ISSUES,
  INTENT_MAX_PATH_CHARS,
  INTENT_MAX_REF_CHARS,
  INTENT_MAX_TICKET_KEYS,
  INTENT_TOTAL_CHARS,
  THIN_BODY_CHARS,
  TICKET_KEY_STOPLIST,
} from './constants.js';

// ---- reference extraction ---------------------------------------------------

export interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

export interface DocRef {
  owner: string;
  repo: string;
  path: string;
  /** Git ref named by a blob URL; null means "the PR head sha" (same-repo docs). */
  ref: string | null;
  /** Display reference stored in `sources` (path, or `owner/repo:path`). */
  display: string;
}

export interface SkippedRef {
  kind: IntentSource['kind'];
  ref: string;
  reason: string;
}

export interface ExtractedRefs {
  issues: IssueRef[];
  docs: DocRef[];
  ticketKeys: string[];
  skipped: SkippedRef[];
}

export interface ExtractInput {
  owner: string;
  repo: string;
  /** The PR's own number, excluded from issue refs. */
  prNumber: number;
  title: string;
  body: string | null;
  branch: string;
  commits: string[];
  /** Issue numbers GitHub reports as closing references (same repo). */
  closingIssues?: number[];
}

const ISSUE_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9][\w.-]{0,38})\/([\w.-]{1,100})\/(?:issues|pull)\/(\d{1,7})(?![\w])/g;
const BLOB_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9][\w.-]{0,38})\/([\w.-]{1,100})\/blob\/([^/\s)>\]"']{1,200})\/([^\s)>\]"'?#]{1,300})/g;
const ANY_URL_RE = /https?:\/\/[^\s)>\]"']{1,500}/g;
const REPO_ISSUE_RE = /(?<![\w/.-])([A-Za-z0-9][\w.-]{0,38})\/([\w.-]{1,100})#(\d{1,7})(?![\w])/g;
const SHORT_ISSUE_RE = /(?<![\w&/#])#(\d{1,7})(?![\w])/g;
const REL_DOC_RE = /(?<![\w/:.@-])((?:\.{1,2}\/)?(?:[\w.-]{1,100}\/){0,10}[\w.-]{1,100}\.(?:md|mdx|markdown|txt|rst|adoc))(?![\w/])/g;
const TICKET_KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9})-(\d{1,6})(?![A-Za-z0-9])/g;
const BRANCH_KEY_RE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})(?![A-Za-z0-9])/g;

const sameOwner = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export type PathCheck =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid_path' | 'extension_not_allowed' };

/**
 * Normalise a repo-relative path from untrusted text. Rejects traversal,
 * absolute paths, NUL, backslashes, a leading `-` and anything over the cap;
 * only documentation extensions are allowed.
 */
export function normaliseRepoPath(raw: string): PathCheck {
  let p = raw.trim();
  while (p.startsWith('./')) p = p.slice(2);
  if (p.length === 0 || p.length > INTENT_MAX_PATH_CHARS) return { ok: false, reason: 'invalid_path' };
  if (p.includes('\0') || p.includes('\\') || p.startsWith('/') || p.startsWith('-')) {
    return { ok: false, reason: 'invalid_path' };
  }
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('-'))) {
    return { ok: false, reason: 'invalid_path' };
  }
  const lower = p.toLowerCase();
  if (!INTENT_DOC_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, reason: 'extension_not_allowed' };
  }
  return { ok: true, path: p };
}

/** Reference stored for an external URL: origin + pathname, never query or fragment. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return (u.origin + u.pathname).slice(0, INTENT_MAX_REF_CHARS);
  } catch {
    return raw.split(/[?#]/)[0]!.slice(0, INTENT_MAX_REF_CHARS);
  }
}

/** Changed docs that are plans or specs are read even when the body never mentions them. */
export function isPlanOrSpecPath(path: string): boolean {
  const lower = path.toLowerCase();
  const check = normaliseRepoPath(path);
  if (!check.ok) return false;
  return lower.startsWith('docs/plans/') || lower.includes('/specs/') || lower.startsWith('specs/') || lower.endsWith('.plan.md');
}

function pushUnique<T>(list: T[], item: T, key: (t: T) => string): void {
  const k = key(item);
  if (!list.some((x) => key(x) === k)) list.push(item);
}

export function extractRefs(input: ExtractInput): ExtractedRefs {
  const text = [
    input.title.slice(0, 300),
    (input.body ?? '').slice(0, INTENT_BODY_CHARS),
    ...input.commits.map((c) => c.slice(0, 200)),
  ].join('\n');

  const issues: IssueRef[] = [];
  const docs: DocRef[] = [];
  const skipped: SkippedRef[] = [];
  const keys: string[] = [];

  const isSameRepo = (owner: string, repo: string) =>
    sameOwner(owner, input.owner) && repo.toLowerCase() === input.repo.toLowerCase();
  const addIssue = (owner: string, repo: string, number: number) => {
    if (!Number.isFinite(number) || number <= 0) return;
    if (!isSameRepo(owner, repo)) {
      pushUnique(skipped, { kind: 'github_issue', ref: `${owner}/${repo}#${number}`, reason: 'cross_repo' }, (s) => s.ref);
      return;
    }
    if (number === input.prNumber) return;
    pushUnique(issues, { owner: input.owner, repo: input.repo, number }, (i) => `${i.repo.toLowerCase()}#${i.number}`);
  };
  const addDoc = (owner: string, repo: string, rawPath: string, ref: string | null) => {
    const sameRepo = isSameRepo(owner, repo);
    const display = sameRepo ? rawPath : `${owner}/${repo}:${rawPath}`;
    if (!sameRepo) {
      pushUnique(skipped, { kind: 'github_doc', ref: display.slice(0, INTENT_MAX_REF_CHARS), reason: 'cross_repo' }, (s) => s.ref);
      return;
    }
    const check = normaliseRepoPath(rawPath);
    if (!check.ok) {
      pushUnique(skipped, { kind: sameRepo ? 'repo_doc' : 'github_doc', ref: display.slice(0, INTENT_MAX_REF_CHARS), reason: check.reason }, (s) => s.ref);
      return;
    }
    const d: DocRef = {
      owner: input.owner,
      repo,
      path: check.path,
      // A same-repo blob URL is read at the PR head sha, not at the branch it names.
      ref: sameRepo ? null : ref,
      display: sameRepo ? check.path : `${input.owner}/${repo}:${check.path}`,
    };
    pushUnique(docs, d, (x) => `${x.repo.toLowerCase()}:${x.path}`);
  };

  // Closing references reported by GitHub come first.
  for (const n of input.closingIssues ?? []) addIssue(input.owner, input.repo, n);

  // Full URLs: consume them so the looser patterns below never see them again.
  let rest = text;
  rest = rest.replace(ISSUE_URL_RE, (_m, o: string, r: string, n: string) => {
    addIssue(o, r, Number(n));
    return ' ';
  });
  rest = rest.replace(BLOB_URL_RE, (_m, o: string, r: string, ref: string, path: string) => {
    addDoc(o, r, path, ref);
    return ' ';
  });
  const external: string[] = [];
  rest = rest.replace(ANY_URL_RE, (m) => {
    const ref = redactUrl(m);
    if (!external.includes(ref)) external.push(ref);
    return ' ';
  });
  for (const ref of external) skipped.push({ kind: 'external_url', ref, reason: 'external_fetch_disabled' });

  rest = rest.replace(REPO_ISSUE_RE, (_m, o: string, r: string, n: string) => {
    addIssue(o, r, Number(n));
    return ' ';
  });
  for (const m of rest.matchAll(SHORT_ISSUE_RE)) addIssue(input.owner, input.repo, Number(m[1]));
  for (const m of rest.matchAll(REL_DOC_RE)) addDoc(input.owner, input.repo, m[1]!, null);

  // Jira-style keys: detected only (no lookup in v1).
  const addKey = (k: string) => {
    if (TICKET_KEY_STOPLIST.has(k.split('-')[0]!)) return;
    if (!keys.includes(k)) keys.push(k);
  };
  for (const m of `${input.title}\n${input.body ?? ''}`.slice(0, INTENT_BODY_CHARS + 300).matchAll(TICKET_KEY_RE)) {
    addKey(`${m[1]}-${m[2]}`);
  }
  for (const m of input.branch.slice(0, 200).matchAll(BRANCH_KEY_RE)) {
    addKey(`${m[1]!.toUpperCase()}-${m[2]}`);
  }

  return {
    issues: issues.slice(0, INTENT_MAX_ISSUES),
    docs: docs.slice(0, INTENT_MAX_DOCS),
    ticketKeys: keys.slice(0, INTENT_MAX_TICKET_KEYS),
    skipped,
  };
}

// ---- confidence -------------------------------------------------------------

export interface ConfidenceFacts {
  bodyChars: number;
  /** A linked issue, plan or spec was read (used or truncated). */
  hasLinkedDoc: boolean;
}

/**
 * Computed in code, never by the model. A ticket key alone does not raise it:
 * nothing was read behind the key.
 */
export function computeConfidence(f: ConfidenceFacts): IntentConfidence {
  if (f.hasLinkedDoc) return 'high';
  if (f.bodyChars >= THIN_BODY_CHARS) return 'medium';
  return 'low';
}

// ---- budget -----------------------------------------------------------------

export interface BudgetText {
  kind: IntentSource['kind'];
  ref: string;
  text: string;
  truncated: boolean;
}

export interface BudgetInput {
  /** Characters already committed to title, body, branch and paths. */
  fixedChars: number;
  docs: BudgetText[];
  issues: BudgetText[];
  commits: string[];
}

export interface BudgetResult {
  docs: BudgetText[];
  issues: BudgetText[];
  commits: string[];
  commitsTruncated: boolean;
}

/** Trim to the total budget in order: docs first, then issues, then commits. */
export function applyBudget(input: BudgetInput, budget: number = INTENT_TOTAL_CHARS): BudgetResult {
  const docs = input.docs.map((d) => ({ ...d }));
  const issues = input.issues.map((d) => ({ ...d }));
  let commits = [...input.commits];
  let commitsTruncated = false;
  const total = () =>
    input.fixedChars +
    docs.reduce((n, d) => n + d.text.length, 0) +
    issues.reduce((n, d) => n + d.text.length, 0) +
    commits.reduce((n, c) => n + c.length + 1, 0);

  const shrink = (list: BudgetText[]) => {
    for (let i = list.length - 1; i >= 0 && total() > budget; i--) {
      const item = list[i]!;
      const over = total() - budget;
      const keep = Math.max(0, item.text.length - over);
      if (keep < item.text.length) {
        item.text = item.text.slice(0, keep);
        item.truncated = true;
      }
    }
  };
  shrink(docs);
  shrink(issues);
  while (total() > budget && commits.length > 0) {
    commits = commits.slice(0, -1);
    commitsTruncated = true;
  }
  return { docs, issues, commits, commitsTruncated };
}

// ---- basis ------------------------------------------------------------------

/** Short labels of what the intent was derived from, for the review prompt. */
export function renderBasis(sources: IntentSource[]): string[] {
  const out: string[] = [];
  const usable = (s: IntentSource) => s.status === 'used' || s.status === 'truncated';
  const has = (kind: IntentSource['kind']) => sources.some((s) => s.kind === kind && usable(s));
  if (has('title')) out.push('title');
  if (has('branch')) out.push('branch');
  if (has('body')) out.push('description');
  const commits = sources.find((s) => s.kind === 'commits' && usable(s));
  if (commits) out.push('commit messages');
  if (has('files')) out.push('changed paths');
  for (const s of sources) {
    if (!usable(s)) continue;
    if (s.kind === 'github_issue') out.push(`issue ${s.ref}`);
    else if (s.kind === 'repo_doc' || s.kind === 'github_doc') out.push(s.ref);
  }
  return out;
}

/** True when a stored source list contains a read issue, plan or spec. */
export function hasLinkedDoc(sources: IntentSource[]): boolean {
  return sources.some(
    (s) =>
      (s.kind === 'github_issue' || s.kind === 'repo_doc' || s.kind === 'github_doc') &&
      (s.status === 'used' || s.status === 'truncated'),
  );
}

/** Subject line of a commit message, capped. */
export function commitSubject(message: string, max: number): string {
  return (message.split('\n', 1)[0] ?? '').trim().slice(0, max);
}
