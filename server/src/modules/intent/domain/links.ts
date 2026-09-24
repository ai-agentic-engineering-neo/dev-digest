/**
 * Pure link extraction (server/specs/05-intent-layer.md, "Data sources").
 * Tickets and docs referenced from the PR title/body/commit messages. Never
 * follows a link found INSIDE a ticket/doc (one hop only, done by the
 * caller); same-repo only; Jira/Linear-shaped keys are recorded `skipped`.
 */
import { DOC_EXTENSIONS, DOC_MAX, NON_TICKET_KEY_PREFIXES, TICKET_MAX } from './constants.js';

export interface RepoRefLite {
  owner: string;
  name: string;
}

export interface TicketRef {
  number: number;
  /** A closing keyword ("closes #N", "fixes #N", …) appeared next to the ref. */
  closing: boolean;
}

export interface SkippedRef {
  ref: string;
  reason: string;
}

export interface DocRef {
  path: string;
}

const CLOSING_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/i;
/** owner/repo#N (foreign unless it matches the current repo). */
const CROSS_REPO_ISSUE_RE = /\b([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)\b/g;
/** A bare #N, not preceded by a word char or "/" (so it doesn't match owner/repo#N again, or "css#fff"-like tokens). */
const BARE_ISSUE_RE = /(?<![\w/])#(\d+)\b/g;
/** github.com/owner/repo/issues/N */
const ISSUE_URL_RE = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)\b/g;
/** Jira/Linear-shaped key, e.g. ABC-123, DEVX-42 (never fetched — out of scope). */
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;

/** True for a JIRA_KEY_RE match that is really a spec/protocol/standard name, not a ticket. */
function isNonTicketKey(key: string): boolean {
  const prefix = key.slice(0, key.indexOf('-'));
  return (NON_TICKET_KEY_PREFIXES as readonly string[]).includes(prefix);
}

/** True when a closing keyword appears in the ~24 chars right before `index`. */
function precededByClosingKeyword(text: string, index: number): boolean {
  return CLOSING_KEYWORD_RE.test(text.slice(Math.max(0, index - 24), index));
}

/**
 * Every ticket-shaped reference in `texts` (title, body, commit messages, in
 * that priority order). Same-repo `#N` / `owner/repo#N` / issue URLs become
 * `refs` (closing keywords first, then first-seen order, deduped, capped at
 * `TICKET_MAX`); foreign-repo refs and Jira/Linear keys become `skipped`.
 */
export function extractTicketRefs(
  texts: readonly string[],
  repo: RepoRefLite,
): { refs: TicketRef[]; skipped: SkippedRef[] } {
  const closing = new Map<number, boolean>();
  const skipped: SkippedRef[] = [];
  const seenSkipped = new Set<string>();

  const addSkipped = (ref: string, reason: string) => {
    const key = `${ref}::${reason}`;
    if (seenSkipped.has(key)) return;
    seenSkipped.add(key);
    skipped.push({ ref, reason });
  };

  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(ISSUE_URL_RE)) {
      const [full, owner, name, numStr] = m;
      if (owner!.toLowerCase() === repo.owner.toLowerCase() && name!.toLowerCase() === repo.name.toLowerCase()) {
        const n = Number(numStr);
        closing.set(n, (closing.get(n) ?? false) || precededByClosingKeyword(text, m.index ?? 0));
      } else {
        addSkipped(full!, `issue reference from a different repository (${owner}/${name})`);
      }
    }
    for (const m of text.matchAll(CROSS_REPO_ISSUE_RE)) {
      const [full, owner, name, numStr] = m;
      if (owner!.toLowerCase() === repo.owner.toLowerCase() && name!.toLowerCase() === repo.name.toLowerCase()) {
        const n = Number(numStr);
        closing.set(n, (closing.get(n) ?? false) || precededByClosingKeyword(text, m.index ?? 0));
      } else {
        addSkipped(full!, `issue reference from a different repository (${owner}/${name})`);
      }
    }
    for (const m of text.matchAll(BARE_ISSUE_RE)) {
      const n = Number(m[1]);
      closing.set(n, (closing.get(n) ?? false) || precededByClosingKeyword(text, m.index ?? 0));
    }
    for (const m of text.matchAll(JIRA_KEY_RE)) {
      const key = m[1]!;
      if (isNonTicketKey(key)) continue; // e.g. UTF-8, SHA-256 — not a ticket reference
      addSkipped(key, 'Jira/Linear-style keys are not supported (server/specs/05-intent-layer.md)');
    }
  }

  const ordered = [...closing.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1])) // closing keywords first
    .map(([number, isClosing]) => ({ number, closing: isClosing }));
  const refs = ordered.slice(0, TICKET_MAX);
  for (const { number } of ordered.slice(TICKET_MAX)) {
    addSkipped(`#${number}`, `ticket limit reached (max ${TICKET_MAX})`);
  }

  return { refs, skipped };
}

/** Markdown links `[label](path)`. */
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
/** Same-repo GitHub blob/tree URL — https://github.com/o/r/(blob|tree)/<ref>/<path>. */
const BLOB_URL_RE = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(?:blob|tree)\/[^/]+\/([^\s)]+)/g;
/** A bare repo-relative doc path mentioned in prose (e.g. "see docs/plans/x.md"). */
const BARE_DOC_RE = /\b((?:[\w-]+\/)*[\w.-]+\.(?:md|mdx|markdown|txt))\b/gi;
/** Any URL — masked out before BARE_DOC_RE so it never matches a substring INSIDE one
 *  (e.g. 'com/acme/api/blob/main/docs/plans/x.md' inside a github blob URL). */
const ANY_URL_RE = /https?:\/\/\S+/g;

/** Replace every match of `re` with same-length whitespace (keeps offsets, drops content). */
function maskMatches(text: string, re: RegExp): string {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

function hasDocExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Priority bucket used to sort candidate doc paths before capping at DOC_MAX. */
function docPriority(path: string): number {
  if (path.startsWith('docs/plans/')) return 0;
  if (path.includes('/specs/') || path.startsWith('specs/')) return 1;
  if (path.startsWith('docs/')) return 2;
  return 3;
}

/**
 * Every markdown/spec doc path referenced in `texts` (title, body). Same-repo
 * only — a link to another repo, or a non-GitHub URL, is never followed (out
 * of scope: server/specs/05-intent-layer.md). Ordered by priority
 * (docs/plans first, then any specs/ dir, then other docs/, then other .md),
 * deduped, capped at `DOC_MAX`; the rest (plus any non-`.md`/foreign
 * candidate) come back as `skipped`.
 */
export function extractDocRefs(
  texts: readonly string[],
  repo: RepoRefLite,
): { refs: DocRef[]; skipped: SkippedRef[] } {
  const candidates = new Set<string>();
  const skipped: SkippedRef[] = [];
  const seenSkipped = new Set<string>();
  const addSkipped = (ref: string, reason: string) => {
    const key = `${ref}::${reason}`;
    if (seenSkipped.has(key)) return;
    seenSkipped.add(key);
    skipped.push({ ref, reason });
  };

  const considerPath = (raw: string) => {
    const path = raw.replace(/^\.\//, '').replace(/[)\]},.]+$/, '');
    if (!hasDocExtension(path)) return; // silently ignore non-doc bare mentions/links
    if (path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) {
      addSkipped(path, 'unsafe path');
      return;
    }
    candidates.add(path);
  };

  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(MD_LINK_RE)) {
      const target = m[1]!;
      if (/^https?:\/\//i.test(target)) {
        const blob = [...target.matchAll(BLOB_URL_RE)][0];
        if (!blob) {
          addSkipped(target, 'non-GitHub or non-blob/tree URL (no arbitrary URL fetch)');
          continue;
        }
        const [, owner, name, path] = blob;
        if (owner!.toLowerCase() !== repo.owner.toLowerCase() || name!.toLowerCase() !== repo.name.toLowerCase()) {
          addSkipped(target, `doc link points outside this repo (${owner}/${name})`);
          continue;
        }
        considerPath(decodeURIComponent(path!));
      } else {
        considerPath(target);
      }
    }
    for (const m of text.matchAll(BLOB_URL_RE)) {
      const [full, owner, name, path] = m;
      if (owner!.toLowerCase() !== repo.owner.toLowerCase() || name!.toLowerCase() !== repo.name.toLowerCase()) {
        addSkipped(full!, `doc link points outside this repo (${owner}/${name})`);
        continue;
      }
      considerPath(decodeURIComponent(path!));
    }
    // Bare paths are only matched in PROSE: mask every markdown link (label +
    // target already handled above) and every URL (github blob/tree already
    // handled above; any other URL never yields a doc path) so BARE_DOC_RE
    // cannot match text that is really part of a link/URL. This also dedupes
    // for free — a path already found via MD_LINK_RE/BLOB_URL_RE is masked
    // out and so can't be re-added (candidates is a Set anyway).
    const prose = maskMatches(maskMatches(text, MD_LINK_RE), ANY_URL_RE);
    for (const m of prose.matchAll(BARE_DOC_RE)) {
      considerPath(m[1]!);
    }
  }

  const ordered = [...candidates].sort(
    (a, b) => docPriority(a) - docPriority(b) || a.localeCompare(b),
  );
  const refs = ordered.slice(0, DOC_MAX).map((path) => ({ path }));
  for (const path of ordered.slice(DOC_MAX)) addSkipped(path, `doc limit reached (max ${DOC_MAX})`);

  return { refs, skipped };
}
