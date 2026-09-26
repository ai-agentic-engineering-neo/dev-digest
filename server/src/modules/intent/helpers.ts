import type {
  IntentConfidence,
  IntentSource,
  IntentSourceKind,
  PrIntentRecord,
  UnifiedDiff,
} from '@devdigest/shared';
import {
  MAX_BODY_SCAN_CHARS,
  MAX_DOCS,
  MAX_HUNK_HEADER_CHARS,
  MAX_INTENT_CHARS,
  MAX_ISSUES,
  MAX_LIST_ITEMS,
  MAX_LIST_ITEM_CHARS,
  MAX_URLS,
  MIN_TRIMMED_SECTION_CHARS,
} from './constants.js';

/**
 * Intent module — pure helpers. Reference parsing, diff outline, confidence,
 * prompt budget, output normalisation, redaction and row -> DTO mapping.
 * No I/O, no clock, no env.
 *
 * The row shape is declared structurally here (not imported from
 * `./repository.js`): an import back from `repository.ts` would form a cycle
 * that `arch:check`'s `no-circular` rule catches on a new module
 * (server/INSIGHTS.md, 2026-09-22).
 */

// ---------------------------------------------------------------- Reference parsing

export interface IssueRef {
  owner: string;
  name: string;
  number: number;
}

export interface ParsedRefs {
  /** Issues the PR closes, via a closing keyword only. */
  issues: IssueRef[];
  /** Repo-relative markdown paths (at the PR head). */
  docs: string[];
  /** External https URLs to fetch as text. */
  urls: string[];
}

/**
 * Closing-keyword grammar: `Fixes #1`, `closes owner/repo#2`,
 * `Resolved: https://github.com/owner/repo/issues/3`. A bare `#123` is NOT a
 * reference. Every quantifier is bounded or over a disjoint character class,
 * so the match is linear-time.
 */
const CLOSING_REF_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?[ \t]+(?:https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d{1,9})(?!\d)|([\w.-]+)\/([\w.-]+)#(\d{1,9})(?!\d)|#(\d{1,9})(?!\d))/gi;

/** https URLs; stops at whitespace, brackets and quotes so markdown links end cleanly. */
const URL_RE = /https:\/\/[^\s<>()[\]"'`]+/gi;

/**
 * A relative `*.md` path token. The lookbehind keeps it from starting inside a
 * longer word, path or URL; the lookahead keeps `x.mdx` and `x.md.bak` out.
 * Runs of the path character class are only entered at a run start, so the
 * scan is linear.
 */
const DOC_PATH_RE = /(?<![\w/.:@-])((?:[\w.-]+\/)*[\w.-]+\.md)(?![\w/-]|\.\w)/gi;

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** A repo-relative markdown path with no scheme, no absolute root and no `..`; else null. */
function toRepoDocPath(raw: string): string | null {
  const p = raw.trim().replace(/^(?:\.\/)+/, '');
  if (!p || p.length > 300) return null;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0') || p.includes(':')) return null;
  if (!/\.md$/i.test(p)) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.toLowerCase() === '.git')) {
    return null;
  }
  return p;
}

function pushUnique<T>(list: T[], seen: Set<string>, key: string, value: T, cap: number): void {
  if (list.length >= cap || seen.has(key)) return;
  seen.add(key);
  list.push(value);
}

/**
 * Extract the references worth fetching from a PR body: closed issues, repo
 * docs and external https URLs. Deduped and capped per kind. GitHub HTML pages
 * (issues, pulls, …) are never returned as URLs — they are not text and issues
 * are only followed through a closing keyword.
 */
export function parseRefs(body: string, repo: { owner: string; name: string }): ParsedRefs {
  const text = body.slice(0, MAX_BODY_SCAN_CHARS);
  const sameRepo = (owner: string, name: string): boolean =>
    owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();

  const issues: IssueRef[] = [];
  const seenIssues = new Set<string>();
  for (const m of text.matchAll(CLOSING_REF_RE)) {
    const ref: IssueRef | null = m[3]
      ? { owner: m[1]!, name: m[2]!, number: Number(m[3]) }
      : m[6]
        ? { owner: m[4]!, name: m[5]!, number: Number(m[6]) }
        : m[7]
          ? { owner: repo.owner, name: repo.name, number: Number(m[7]) }
          : null;
    if (!ref) continue;
    pushUnique(issues, seenIssues, `${ref.owner}/${ref.name}#${ref.number}`.toLowerCase(), ref, MAX_ISSUES);
  }

  const docs: string[] = [];
  const seenDocs = new Set<string>();
  const urls: string[] = [];
  const seenUrls = new Set<string>();

  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:!?*_]+$/, '');
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || u.username || u.password) continue;
    const host = u.hostname.toLowerCase();
    if (host === 'github.com' || host === 'www.github.com') {
      const blob = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(u.pathname);
      if (!blob) continue;
      const [, owner, name, ref, path] = blob as unknown as [string, string, string, string, string];
      if (sameRepo(owner, name)) {
        const decoded = safeDecode(path);
        const docPath = decoded === null ? null : toRepoDocPath(decoded);
        if (docPath) pushUnique(docs, seenDocs, docPath, docPath, MAX_DOCS);
      } else {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${path}`;
        pushUnique(urls, seenUrls, rawUrl, rawUrl, MAX_URLS);
      }
      continue;
    }
    const url = u.origin + u.pathname + u.search;
    pushUnique(urls, seenUrls, url, url, MAX_URLS);
  }

  // Bare tokens and markdown links: scanned with the URLs blanked out so a
  // path inside a query string is not mistaken for a repo doc.
  const withoutUrls = text.replace(URL_RE, ' ');
  for (const m of withoutUrls.matchAll(DOC_PATH_RE)) {
    const docPath = toRepoDocPath(m[1]!);
    if (docPath) pushUnique(docs, seenDocs, docPath, docPath, MAX_DOCS);
  }

  return { issues, docs, urls };
}

// ---------------------------------------------------------------- Diff outline

export interface OutlineFile {
  path: string;
  /** `@@ … @@ <context>` lines only — never a changed body line. */
  hunkHeaders: string[];
}

function clipHeader(line: string): string {
  return line.trimEnd().slice(0, MAX_HUNK_HEADER_CHARS);
}

/** Outline from a raw unified diff. Only `diff --git`, `+++` and `@@` lines are read. */
export function outlineFromDiff(diff: UnifiedDiff): OutlineFile[] {
  const out: OutlineFile[] = [];
  let cur: OutlineFile | null = null;
  let inFileHeader = false;
  for (const line of diff.raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const idx = line.lastIndexOf(' b/');
      cur = { path: idx >= 0 ? line.slice(idx + 3).trim() : line.slice(11).trim(), hunkHeaders: [] };
      out.push(cur);
      inFileHeader = true;
      continue;
    }
    // A `+++ ` line is only a header before the first hunk; inside a hunk it
    // could be an added line, so it is never read there.
    if (cur && inFileHeader && line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      if (target.startsWith('b/')) cur.path = target.slice(2);
      continue;
    }
    if (line.startsWith('@@')) {
      inFileHeader = false;
      cur?.hunkHeaders.push(clipHeader(line));
    }
  }
  if (out.length > 0) return out;
  // Fallback for a diff without git headers: rebuild the headers from the parsed hunks.
  return diff.files.map((f) => ({
    path: f.path,
    hunkHeaders: f.hunks.map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`),
  }));
}

/** Outline from per-file patches (hunks only, no `diff --git` line). */
export function outlineFromPatches(files: { path: string; patch: string | null }[]): OutlineFile[] {
  return files.map((f) => ({
    path: f.path,
    hunkHeaders: (f.patch ?? '')
      .split('\n')
      .filter((l) => l.startsWith('@@'))
      .map(clipHeader),
  }));
}

/** Plain-text rendering of an outline: one path line, then its indented hunk headers. */
export function renderOutline(outline: OutlineFile[]): string {
  return outline
    .map((f) => [f.path, ...f.hunkHeaders.map((h) => `  ${h}`)].join('\n'))
    .join('\n');
}

// ---------------------------------------------------------------- Confidence

/**
 * Deterministic confidence — never model-reported. `high` when a linked source
 * (issue, repo doc, web page) was read; else `medium` when the PR has a
 * description; else `low`.
 */
export function deriveConfidence(
  sources: Pick<IntentSource, 'kind' | 'status'>[],
  description: string,
): IntentConfidence {
  const linked = sources.some(
    (s) =>
      (s.kind === 'issue' || s.kind === 'repo_doc' || s.kind === 'web') &&
      (s.status === 'ok' || s.status === 'truncated'),
  );
  if (linked) return 'high';
  return description.trim() ? 'medium' : 'low';
}

// ---------------------------------------------------------------- Prompt budget

/** One classifier input section. `outline` is set on the diff-outline section so it can be shrunk. */
export interface BudgetSection {
  label: string;
  kind: IntentSourceKind;
  /** Redacted reference, as stored in the ledger. */
  ref: string;
  text: string;
  status: 'ok' | 'truncated';
  outline?: OutlineFile[];
}

const FETCHED_KINDS: readonly IntentSourceKind[] = ['issue', 'repo_doc', 'web'];

/** Cut to `max` chars without leaving half of a surrogate pair. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const end = /[\uD800-\uDBFF]/.test(s[max - 1] ?? '') ? max - 1 : max;
  return s.slice(0, end);
}

/**
 * Fit the sections to `budget` (in `count` units). First the hunk headers of the
 * outline go, keeping headers for as many leading files as still fit (so the
 * last file loses its headers first); then the longest fetched docs are trimmed
 * (never below MIN_TRIMMED_SECTION_CHARS). Every changed section becomes
 * `truncated`. Returns new sections; the input is not mutated.
 */
export function fitToBudget(
  sections: BudgetSection[],
  count: (text: string) => number,
  budget: number,
): BudgetSection[] {
  const out = sections.map((s) => ({ ...s }));
  const sizes = out.map((s) => count(s.text));
  let total = sizes.reduce((a, b) => a + b, 0);

  // Phase 1: hunk headers of the outline section(s).
  for (let i = 0; i < out.length && total > budget; i++) {
    const section = out[i]!;
    const outline = section.outline;
    if (!outline || outline.every((f) => f.hunkHeaders.length === 0)) continue;
    const others = total - sizes[i]!;
    const render = (keep: number): string =>
      renderOutline(outline.map((f, j) => (j < keep ? f : { ...f, hunkHeaders: [] })));
    // Largest number of leading files whose headers still fit (0 when none do).
    let lo = 0;
    let hi = outline.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (others + count(render(mid)) <= budget) lo = mid;
      else hi = mid - 1;
    }
    section.text = render(lo);
    section.outline = outline.map((f, j) => (j < lo ? f : { ...f, hunkHeaders: [] }));
    section.status = 'truncated';
    sizes[i] = count(section.text);
    total = others + sizes[i]!;
  }

  // Phase 2: trim the longest fetched docs.
  while (total > budget) {
    let pick = -1;
    for (let i = 0; i < out.length; i++) {
      const s = out[i]!;
      if (!FETCHED_KINDS.includes(s.kind) || s.text.length <= MIN_TRIMMED_SECTION_CHARS) continue;
      if (pick === -1 || s.text.length > out[pick]!.text.length) pick = i;
    }
    if (pick === -1) break;
    const section = out[pick]!;
    const nextLen = Math.max(MIN_TRIMMED_SECTION_CHARS, Math.floor(section.text.length * 0.75));
    section.text = cut(section.text, nextLen);
    section.status = 'truncated';
    total -= sizes[pick]!;
    sizes[pick] = count(section.text);
    total += sizes[pick]!;
  }

  return out;
}

// ---------------------------------------------------------------- Output normalisation

export interface RawClassification {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  missing_context: string[];
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${cut(t, max - 1)}…`;
}

function clipList(items: string[], maxItems: number, maxChars: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const v = clip(item, maxChars);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Apply the output caps to the model's answer: intent length, list length, item length. */
export function normalizeClassification(raw: RawClassification): RawClassification {
  return {
    intent: clip(raw.intent, MAX_INTENT_CHARS),
    in_scope: clipList(raw.in_scope, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    out_of_scope: clipList(raw.out_of_scope, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    missing_context: clipList(raw.missing_context, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
  };
}

const SOURCE_LABEL: Record<IntentSourceKind, string> = {
  description: 'PR description',
  issue: 'linked issue',
  repo_doc: 'repo document',
  web: 'web page',
  diff_outline: 'file outline',
};

/** One line per `unavailable` source, then the model's own gaps; deduped and capped. */
export function buildMissingContext(
  sources: Pick<IntentSource, 'kind' | 'ref' | 'status'>[],
  modelGaps: string[],
): string[] {
  const lines = sources
    .filter((s) => s.status === 'unavailable')
    .map((s) => `Could not read ${SOURCE_LABEL[s.kind]}: ${redactRef(s.ref)}`);
  return clipList([...lines, ...modelGaps], MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS);
}

// ---------------------------------------------------------------- Redaction

/** URLs become `origin + pathname` (no userinfo, query or fragment); other refs pass through. */
export function redactRef(ref: string): string {
  if (!/^https?:\/\//i.test(ref)) return ref;
  try {
    const u = new URL(ref);
    return u.origin + u.pathname;
  } catch {
    return ref.split(/[?#]/, 1)[0] ?? '';
  }
}

// ---------------------------------------------------------------- Row -> DTO

export interface PrIntentRowLike {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: string[];
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  updatedAt: Date;
}

export function toPrIntentRecord(row: PrIntentRowLike): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    missing_context: row.missingContext,
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    updated_at: row.updatedAt.toISOString(),
  };
}
