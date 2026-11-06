// Pure reference parsing for the intent module. Nothing here fetches anything:
// URLs are only parsed, external ones are reduced to their host.
import type { IntentSourceWeight } from './types.js';
import { BODY_PARSE_MAX_CHARS, MAX_EXTERNAL_LINKS, MAX_TRACKER_KEYS } from '../constants.js';

export interface RepoSlug {
  owner: string;
  name: string;
}
export interface IssueRef {
  number: number;
  weight: IntentSourceWeight;
  crossRepo: string | null;
  via: 'keyword' | 'mention' | 'url' | 'branch';
}
export interface LinkedDocRef {
  path: string;
  kind: 'plan' | 'spec' | 'doc';
}
export interface BodyRefs {
  issues: IssueRef[];
  docs: LinkedDocRef[];
  unsafeDocs: string[];
  externalHosts: string[];
  trackerKeys: string[];
}

const MAX_UNSAFE_DOCS = 10;

/** Drop HTML comments and fenced code blocks; cap the length. All patterns are linear. */
export function stripNonContent(body: string): string {
  const capped = body.slice(0, BODY_PARSE_MAX_CHARS);
  return capped
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .slice(0, BODY_PARSE_MAX_CHARS);
}

const NUM = '(\\d{1,9})';
const SLUG = '([\\w.-]+)\\/([\\w.-]+)';
const CLOSING_RE = new RegExp(
  `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b:?\\s+(?:https:\\/\\/github\\.com\\/${SLUG}\\/issues\\/${NUM}|${SLUG}#${NUM}|#${NUM})`,
  'gi',
);
const ISSUE_URL_RE = new RegExp(`https:\\/\\/github\\.com\\/${SLUG}\\/issues\\/${NUM}`, 'gi');
const REPO_MENTION_RE = new RegExp(`(?<![\\w.-])${SLUG}#${NUM}`, 'g');
const HASH_MENTION_RE = new RegExp(`(?<![\\w&/])#${NUM}(?!\\w)`, 'g');
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const LINK_TARGET_RE = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const TRACKER_RE = /\b[A-Z][A-Z0-9]+-\d{1,9}\b/g;
const BLOB_URL_RE = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/(.+)$/i;
const OTHER_SCHEME_RE = /^[a-z][a-z0-9+.-]+:/i;
const DOC_EXT_RE = /\.(?:md|mdx|txt)$/i;

function sameRepo(owner: string, name: string, repo: RepoSlug): boolean {
  return owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();
}

export function normalizeDocPath(raw: string): string | null {
  let p = raw.split(/[?#]/)[0] ?? '';
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (p.includes('\0')) return null;
  p = p.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' || seg.toLowerCase() === '.git') return null;
    segments.push(seg);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

export function classifyDocPath(path: string): 'plan' | 'spec' | 'doc' | null {
  if (/^plans\/[^/]+\.md$/.test(path)) return 'plan';
  if (/^(?:[^/]+\/)*specs\/[^/]+\.md$/.test(path)) return 'spec';
  if (/^(?:[^/]+\/)?docs\/(?:[^/]+\/)*[^/]+\.(?:md|mdx|txt)$/.test(path)) return 'doc';
  return null;
}

export function branchRefs(branch: string): { issue: number | null; trackerKey: string | null } {
  const num = /^(\d{1,9})[-_/]/.exec(branch);
  const key = /\b[A-Z][A-Z0-9]+-\d{1,9}\b/.exec(branch);
  const issue = num?.[1] ? Number(num[1]) : 0;
  // Same rule as addIssue: issue numbers are positive ("0-cleanup" is not issue #0).
  return { issue: issue > 0 ? issue : null, trackerKey: key?.[0] ?? null };
}

export function parseBodyRefs(body: string, repo: RepoSlug, selfNumber: number): BodyRefs {
  const text = stripNonContent(body);

  // --- issues -------------------------------------------------------------
  const found = new Map<string, { ref: IssueRef; idx: number }>();
  const addIssue = (idx: number, owner: string | undefined, name: string | undefined, num: string, weight: IntentSourceWeight, via: IssueRef['via']): void => {
    const number = Number(num);
    if (!Number.isSafeInteger(number) || number <= 0) return;
    const cross = owner && name && !sameRepo(owner, name, repo) ? `${owner}/${name}` : null;
    if (cross === null && number === selfNumber) return;
    const key = `${cross?.toLowerCase() ?? ''}#${number}`;
    const prev = found.get(key);
    if (!prev) {
      found.set(key, { ref: { number, weight, crossRepo: cross, via }, idx });
    } else if (weight === 'strong' && prev.ref.weight === 'weak') {
      prev.ref = { number, weight, crossRepo: cross, via };
      prev.idx = Math.min(prev.idx, idx);
    } else {
      prev.idx = Math.min(prev.idx, idx);
    }
  };

  for (const m of text.matchAll(CLOSING_RE)) {
    const idx = m.index ?? 0;
    if (m[3]) addIssue(idx, m[1], m[2], m[3], 'strong', 'keyword');
    else if (m[6]) addIssue(idx, m[4], m[5], m[6], 'strong', 'keyword');
    else if (m[7]) addIssue(idx, undefined, undefined, m[7], 'strong', 'keyword');
  }
  for (const m of text.matchAll(ISSUE_URL_RE)) {
    if (m[3]) addIssue(m.index ?? 0, m[1], m[2], m[3], 'weak', 'url');
  }
  for (const m of text.matchAll(REPO_MENTION_RE)) {
    if (m[3]) addIssue(m.index ?? 0, m[1], m[2], m[3], 'weak', 'mention');
  }
  for (const m of text.matchAll(HASH_MENTION_RE)) {
    if (m[1]) addIssue(m.index ?? 0, undefined, undefined, m[1], 'weak', 'mention');
  }
  const issues = [...found.values()].sort((a, b) => a.idx - b.idx).map((e) => e.ref);

  // --- URLs: this repo's blobs → docs, everything else → host only ---------
  const docs = new Map<string, LinkedDocRef>();
  const unsafe = new Set<string>();
  const hosts = new Set<string>();

  const addDoc = (rawPath: string): void => {
    const norm = normalizeDocPath(rawPath);
    if (norm === null) {
      if (unsafe.size < MAX_UNSAFE_DOCS) unsafe.add(rawPath.slice(0, 200));
      return;
    }
    const kind = classifyDocPath(norm);
    if (kind && !docs.has(norm)) docs.set(norm, { path: norm, kind });
  };
  const addHost = (host: string): void => {
    if (hosts.size < MAX_EXTERNAL_LINKS) hosts.add(host.toLowerCase());
  };

  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    const issueUrl = new RegExp(`^https:\\/\\/github\\.com\\/${SLUG}\\/issues\\/${NUM}`, 'i').exec(url);
    if (issueUrl) continue; // handled as an issue ref
    const blob = BLOB_URL_RE.exec(url);
    if (blob?.[1] && blob[2] && blob[3] && sameRepo(blob[1], blob[2], repo)) {
      addDoc(blob[3]);
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.hostname.toLowerCase() === 'github.com') {
      const segs = parsed.pathname.split('/').filter(Boolean);
      if (segs.length >= 2 && segs[0] && segs[1] && sameRepo(segs[0], segs[1], repo)) continue;
      addHost(segs.length >= 2 ? `github.com/${segs[0]}/${segs[1]}` : 'github.com');
    } else {
      addHost(parsed.hostname);
    }
  }

  const noUrls = text.replace(URL_RE, ' ');

  // --- relative links and bare tokens -------------------------------------
  for (const m of text.matchAll(LINK_TARGET_RE)) {
    const target = m[1];
    if (!target || target.startsWith('#') || /^https?:\/\//i.test(target)) continue;
    if (OTHER_SCHEME_RE.test(target)) continue; // mailto:, javascript: … (single-letter = drive, falls through)
    addDoc(target);
  }
  for (const token of noUrls.split(/[\s()<>[\]"'`,;]+/)) {
    if (!token || !DOC_EXT_RE.test(token) || OTHER_SCHEME_RE.test(token)) continue;
    addDoc(token);
  }

  // --- tracker keys --------------------------------------------------------
  const trackerKeys: string[] = [];
  for (const m of noUrls.matchAll(TRACKER_RE)) {
    if (trackerKeys.length >= MAX_TRACKER_KEYS) break;
    if (!trackerKeys.includes(m[0])) trackerKeys.push(m[0]);
  }

  return {
    issues,
    docs: [...docs.values()],
    unsafeDocs: [...unsafe],
    externalHosts: [...hosts],
    trackerKeys,
  };
}

/** New-file side of a unified-diff patch. complete ⇔ exactly one hunk that starts at '@@ -0,0 +1'. */
export function newSideFromPatch(patch: string): { text: string; complete: boolean } | null {
  const out: string[] = [];
  let hunks = 0;
  let newFileHunk = false;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m) continue;
      hunks += 1;
      inHunk = true;
      newFileHunk = m[1] === '0' && m[2] === '0' && m[3] === '1';
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+') || line.startsWith(' ')) out.push(line.slice(1));
  }
  if (hunks === 0) return null;
  return { text: out.join('\n'), complete: hunks === 1 && newFileHunk };
}
