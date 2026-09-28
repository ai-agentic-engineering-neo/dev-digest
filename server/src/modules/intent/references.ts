import type { IntentSource } from '@devdigest/shared';
import {
  DOC_EXTENSIONS,
  MAX_LINKED_DOCS,
  MAX_LINKED_ISSUES,
  MAX_REF_CHARS,
  MAX_UNRESOLVED_REFS,
  NOT_TICKET_PREFIXES,
} from './constants.js';
import type { ParsedReferences } from './types.js';

/**
 * Pull what the PR's own text points at, out of already-capped author input.
 * Every pattern here is FIXED (no user-supplied regex, no backtracking over
 * unbounded input) — the caller has already sliced the body to `MAX_BODY_CHARS`.
 */

const DOC_EXT_PATTERN = DOC_EXTENSIONS.join('|');
const DOC_PATH_RE = new RegExp(
  `(?:^|[\\s(\\[])(\\.\\/)?([A-Za-z0-9_.-]+(?:\\/[A-Za-z0-9_.-]+)*\\.(?:${DOC_EXT_PATTERN}))(?=[\\s)\\].,;:]|$)`,
  'gi',
);
const BLOB_URL_RE = /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/blob\/([^\s)>\]]+)/gi;
const CLOSING_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)/gi;
const PLAIN_HASH_ISSUE_RE = /(?:^|[\s(])#(\d+)\b/g;
const REPO_ISSUE_RE = /\b([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)\b/g;
const ISSUE_URL_RE = /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/gi;
const GENERIC_URL_RE = /https?:\/\/[^\s)]+/gi;
const TICKET_RE = /\b([A-Z][A-Z0-9]+)-(\d+)\b/g;

function isSafeRepoPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_REF_CHARS) return false;
  if (path.startsWith('/')) return false;
  if (path.split('/').some((seg) => seg === '..')) return false;
  return /^[A-Za-z0-9._/-]+$/.test(path);
}

function clip(text: string): string {
  return text.length > MAX_REF_CHARS ? text.slice(0, MAX_REF_CHARS) : text;
}

function sameRepo(owner: string, name: string, repo: { owner: string; name: string }): boolean {
  return owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();
}

/** Split a blob URL's `<ref>/<path>` tail — the ref may itself contain
 * slashes (`feature/foo`), so try the shortest split first. */
function splitBlobRef(rest: string): string | null {
  const clean = rest.split(/[?#]/, 1)[0] ?? '';
  const segments = clean.split('/').filter(Boolean);
  for (let refLen = 1; refLen <= Math.min(3, segments.length - 1); refLen++) {
    const path = segments.slice(refLen).join('/');
    if (path && isSafeRepoPath(path) && new RegExp(`\\.(?:${DOC_EXT_PATTERN})$`, 'i').test(path)) {
      return path;
    }
  }
  return null;
}

export function parseReferences(
  input: { title: string; body: string; branch: string },
  repo: { owner: string; name: string },
  prNumber: number,
): ParsedReferences {
  const text = `${input.title}\n${input.body}`;
  const docPaths: string[] = [];
  const issueNumbers: number[] = [];
  const unresolved: IntentSource[] = [];

  const addUnresolved = (source: IntentSource) => {
    if (unresolved.length < MAX_UNRESOLVED_REFS) unresolved.push(source);
  };
  const addDoc = (path: string) => {
    const clean = path.startsWith('./') ? path.slice(2) : path;
    if (!isSafeRepoPath(clean) || docPaths.includes(clean)) return;
    if (docPaths.length < MAX_LINKED_DOCS) {
      docPaths.push(clean);
    } else {
      addUnresolved({ kind: 'linked_doc', ref: clip(clean), status: 'unresolved', note: 'limit reached' });
    }
  };
  const addIssue = (n: number) => {
    if (n === prNumber || issueNumbers.includes(n)) return;
    if (issueNumbers.length < MAX_LINKED_ISSUES) {
      issueNumbers.push(n);
    } else {
      addUnresolved({ kind: 'linked_issue', ref: String(n), status: 'unresolved', note: 'limit reached' });
    }
  };

  for (const m of text.matchAll(DOC_PATH_RE)) {
    addDoc(`${m[1] ?? ''}${m[2]}`);
  }

  for (const m of text.matchAll(BLOB_URL_RE)) {
    const [, owner = '', name = '', rest = ''] = m;
    if (sameRepo(owner, name, repo)) {
      const path = splitBlobRef(rest);
      if (path) addDoc(path);
    } else {
      addUnresolved({
        kind: 'external_link',
        ref: clip(`github.com/${owner}/${name}/blob/${rest.split(/[?#]/, 1)[0]}`),
        status: 'unresolved',
        note: 'other repository — not fetched',
      });
    }
  }

  for (const m of text.matchAll(CLOSING_KEYWORD_RE)) addIssue(Number(m[1]));
  for (const m of text.matchAll(PLAIN_HASH_ISSUE_RE)) addIssue(Number(m[1]));

  for (const m of text.matchAll(REPO_ISSUE_RE)) {
    const [, owner = '', name = '', nRaw = ''] = m;
    const n = Number(nRaw);
    if (sameRepo(owner, name, repo)) {
      addIssue(n);
    } else {
      addUnresolved({
        kind: 'linked_issue',
        ref: clip(`${owner}/${name}#${n}`),
        status: 'unresolved',
        note: 'other repository — not fetched',
      });
    }
  }
  for (const m of text.matchAll(ISSUE_URL_RE)) {
    const [, owner = '', name = '', nRaw = ''] = m;
    const n = Number(nRaw);
    if (sameRepo(owner, name, repo)) {
      addIssue(n);
    } else {
      addUnresolved({
        kind: 'linked_issue',
        ref: clip(`${owner}/${name}#${n}`),
        status: 'unresolved',
        note: 'other repository — not fetched',
      });
    }
  }

  for (const m of text.matchAll(GENERIC_URL_RE)) {
    const raw = m[0];
    if (/^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(blob|issues)\//i.test(raw)) continue;
    try {
      const url = new URL(raw);
      addUnresolved({
        kind: 'external_link',
        ref: clip(`${url.origin}${url.pathname}`),
        status: 'unresolved',
        note: 'external link — not fetched',
      });
    } catch {
      // malformed URL text — not a reference worth recording
    }
  }

  const ticketText = `${input.title}\n${input.body}\n${input.branch}`;
  const seenTickets = new Set<string>();
  for (const m of ticketText.matchAll(TICKET_RE)) {
    const prefix = m[1] ?? '';
    const key = `${prefix}-${m[2]}`;
    if ((NOT_TICKET_PREFIXES as readonly string[]).includes(prefix)) continue;
    if (seenTickets.has(key)) continue;
    seenTickets.add(key);
    addUnresolved({
      kind: 'ticket_ref',
      ref: clip(key),
      status: 'unresolved',
      note: 'ticket key — no tracker integration',
    });
  }

  return { docPaths, issueNumbers, unresolved };
}
