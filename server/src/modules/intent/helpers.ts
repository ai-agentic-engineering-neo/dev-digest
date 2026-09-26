/**
 * L03 — Intent layer pure helpers (ring ②). No I/O: no `await`, no db, no
 * container. `node:crypto`'s sha256 is a pure computation, not I/O, so it is
 * fine here (onion-architecture §4).
 */
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type {
  IntentConfidence,
  IntentConfidenceBasis,
  IntentSource,
  IntentSourceKind,
  PrIntentRecord,
} from '@devdigest/shared';
import type { IntentRow } from './repository.js';
import {
  INTENT_PROMPT_VERSION,
  MAX_INTENT_CHARS,
  MAX_SCOPE_ITEMS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SPEC_FILES,
  MIN_BODY_CHARS,
  MIN_BODY_WORDS,
  SPEC_EXTENSIONS,
  SPEC_PATH_PATTERNS,
  TRACKER_HOSTS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Link resolution — extractLinks
// ---------------------------------------------------------------------------

export interface RepoIdentity {
  owner: string;
  name: string;
  prNumber: number;
}

export interface ExtractedIssueRef {
  number: number;
  /** Preceded by a closing keyword (close/closes/fix/…). */
  strong: boolean;
}

export interface ExtractedExternalLink {
  ref: string;
  reason: 'other_repo' | 'external_host';
}

export interface ExtractedSpecLink {
  path: string;
}

export interface ExtractedLinks {
  issues: ExtractedIssueRef[];
  externalLinks: ExtractedExternalLink[];
  specLinks: ExtractedSpecLink[];
}

const CLOSING_KEYWORDS =
  '(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)';

/**
 * One combined pass over the body, in document order, recognizing:
 *   - an optional closing keyword directly before a reference (captured in
 *     group 1, so we can tell whether THIS match was "strong"),
 *   - `owner/repo#N` or bare `#N`,
 *   - a full `https://github.com/{owner}/{repo}/(issues|pull)/{N}` URL.
 */
const REF_RE_WITH_KEYWORD = new RegExp(
  `(\\b${CLOSING_KEYWORDS}\\b:?\\s+)?` +
    `(?:([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+)#(\\d+)` +
    `|#(\\d+)` +
    `|https?:\\/\\/github\\.com\\/([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+)\\/(?:issues|pull)\\/(\\d+))`,
  'gi',
);

const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const BLOB_URL_RE =
  /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/blob\/([^/\s)]+)\/([^\s)]+)/g;
const GENERIC_URL_RE = /https?:\/\/[^\s)]+/g;

/** Repo-relative, extension-allowed, no `..`/leading-slash/backslash/dot-segment. */
export function isValidSpecPath(path: string): boolean {
  if (!path) return false;
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\\')) return false;
  const segments = path.split('/');
  if (segments.some((s) => s.startsWith('.'))) return false;
  const ext = extname(path).toLowerCase();
  return (SPEC_EXTENSIONS as readonly string[]).includes(ext);
}

/** A changed file counts as `spec_in_diff`: matches SPEC_PATH_PATTERNS and has
    a spec-shaped, safe path. */
export function isSpecInDiffPath(path: string): boolean {
  return isValidSpecPath(path) && SPEC_PATH_PATTERNS.some((re) => re.test(path));
}

// ---------------------------------------------------------------------------
// Spec file candidate selection — pickSpecFilesFromPaths
// ---------------------------------------------------------------------------

export interface SpecFileCandidate {
  path: string;
  kind: 'linked_spec' | 'spec_in_diff';
}

export interface PickedSpecFiles {
  /** Candidates to fetch, in priority order (linked first), capped at MAX_SPEC_FILES. */
  selected: SpecFileCandidate[];
  /** Candidates beyond the cap — the caller records these `skipped` / `limit_reached`. */
  overflow: SpecFileCandidate[];
}

/**
 * Pure candidate selection for `linked_spec` / `spec_in_diff` sources: linked
 * spec paths first, then changed paths that look like a spec
 * (`isSpecInDiffPath`), de-duplicated (a path that is both linked and changed
 * counts once, as `linked_spec`), then split at `MAX_SPEC_FILES`. No I/O.
 */
export function pickSpecFilesFromPaths(
  linkedPaths: string[],
  changedPaths: string[],
): PickedSpecFiles {
  const candidates: SpecFileCandidate[] = [];
  for (const path of linkedPaths) {
    if (candidates.some((c) => c.path === path)) continue;
    candidates.push({ path, kind: 'linked_spec' });
  }
  for (const path of changedPaths) {
    if (!isSpecInDiffPath(path)) continue;
    if (candidates.some((c) => c.path === path)) continue;
    candidates.push({ path, kind: 'spec_in_diff' });
  }
  return {
    selected: candidates.slice(0, MAX_SPEC_FILES),
    overflow: candidates.slice(MAX_SPEC_FILES),
  };
}

function sameRepo(owner: string, name: string, id: RepoIdentity): boolean {
  return owner.toLowerCase() === id.owner.toLowerCase() && name.toLowerCase() === id.name.toLowerCase();
}

/** Pure link/reference extraction from a PR body. No fetching. */
export function extractLinks(body: string | null | undefined, id: RepoIdentity): ExtractedLinks {
  const text = body ?? '';
  const issues: ExtractedIssueRef[] = [];
  const externalLinks: ExtractedExternalLink[] = [];
  const specLinks: ExtractedSpecLink[] = [];

  const addIssue = (number: number, strong: boolean) => {
    const existing = issues.find((i) => i.number === number);
    if (existing) {
      if (strong) existing.strong = true;
      return;
    }
    issues.push({ number, strong });
  };
  const addExternal = (ref: string, reason: 'other_repo' | 'external_host') => {
    if (externalLinks.some((e) => e.ref === ref && e.reason === reason)) return;
    externalLinks.push({ ref, reason });
  };
  const addSpec = (path: string) => {
    if (specLinks.some((s) => s.path === path)) return;
    specLinks.push({ path });
  };

  // ---- issue / PR references (closing keywords, owner/repo#N, #N, full URLs) --
  REF_RE_WITH_KEYWORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE_WITH_KEYWORD.exec(text))) {
    const strong = Boolean(m[1]);
    if (m[2] && m[3] && m[4]) {
      // owner/repo#N
      const owner = m[2];
      const name = m[3];
      const number = Number(m[4]);
      if (sameRepo(owner, name, id)) {
        if (number === id.prNumber) continue; // self-reference, ignored
        addIssue(number, strong);
      } else {
        addExternal(`${owner}/${name}#${number}`, 'other_repo');
      }
    } else if (m[5]) {
      // bare #N — assumed same repo
      const number = Number(m[5]);
      if (number === id.prNumber) continue;
      addIssue(number, strong);
    } else if (m[6] && m[7] && m[8]) {
      // full github issues/pull URL
      const owner = m[6];
      const name = m[7];
      const number = Number(m[8]);
      if (sameRepo(owner, name, id)) {
        if (number === id.prNumber) continue;
        addIssue(number, strong);
      } else {
        addExternal(`${owner}/${name}#${number}`, 'other_repo');
      }
    }
  }

  // ---- spec/plan links: markdown links, inline code, blob URLs --------------
  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(text))) {
    const raw = (m[1] ?? '').trim();
    if (/^https?:\/\//i.test(raw)) continue; // handled by blob/generic URL passes
    if (isValidSpecPath(raw)) addSpec(raw);
  }
  INLINE_CODE_RE.lastIndex = 0;
  while ((m = INLINE_CODE_RE.exec(text))) {
    const raw = (m[1] ?? '').trim();
    if (isValidSpecPath(raw)) addSpec(raw);
  }
  BLOB_URL_RE.lastIndex = 0;
  while ((m = BLOB_URL_RE.exec(text))) {
    const owner = m[1] ?? '';
    const name = m[2] ?? '';
    const path = m[4] ?? '';
    if (!owner || !name || !path) continue;
    if (!sameRepo(owner, name, id)) continue;
    if (isValidSpecPath(path)) addSpec(path);
  }

  // ---- external tracker hosts (non-github, non-spec URLs) -------------------
  GENERIC_URL_RE.lastIndex = 0;
  while ((m = GENERIC_URL_RE.exec(text))) {
    const url = m[0];
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === 'github.com') continue; // handled above
    const isTracker = TRACKER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (isTracker) addExternal(url, 'external_host');
  }

  return { issues, externalLinks, specLinks };
}

// ---------------------------------------------------------------------------
// Substantive-body heuristic
// ---------------------------------------------------------------------------

/**
 * `true` when the PR body carries real prose beyond boilerplate. Strips HTML
 * comments, ATX heading LINES (never a bare `#` — see server INSIGHTS
 * 2026-09-22 markdown heuristics), checklist lines, and link-only lines, then
 * requires the collapsed text to differ from the title and clear both a
 * character and a word-count floor.
 */
export function isSubstantiveBody(body: string | null | undefined, title: string): boolean {
  if (!body) return false;
  let text = body;
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/^#{1,6}\s+\S.*$/gm, '');
  text = text.replace(/^\s*[-*+]\s*\[[ xX]\]\s*.*$/gm, '');
  text = text.replace(/^\s*(?:\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)\s*$/gm, '');
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return false;
  if (collapsed.toLowerCase() === title.trim().toLowerCase()) return false;
  const words = collapsed.split(' ').filter(Boolean);
  return collapsed.length >= MIN_BODY_CHARS && words.length >= MIN_BODY_WORDS;
}

// ---------------------------------------------------------------------------
// Deterministic truncation
// ---------------------------------------------------------------------------

export interface TruncateResult {
  text: string;
  status: 'used' | 'truncated';
}

/** Head slice + a deterministic marker — never a random/ellipsis-only cut. */
export function truncateSource(text: string, cap: number): TruncateResult {
  if (text.length <= cap) return { text, status: 'used' };
  const truncatedChars = text.length - cap;
  return { text: `${text.slice(0, cap)}\n…[truncated ${truncatedChars} chars]`, status: 'truncated' };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export interface SourceStatusLookup {
  kind: IntentSourceKind;
  status: IntentSource['status'];
}

/** Rules 1–6 (see specs/L03-intent-layer.md § Confidence), in order. */
export function computeConfidence(
  sources: SourceStatusLookup[],
  body: string | null | undefined,
  title: string,
): { level: IntentConfidence; basis: IntentConfidenceBasis } {
  const resolved = (kind: IntentSourceKind) =>
    sources.some((s) => s.kind === kind && (s.status === 'used' || s.status === 'truncated'));
  const substantive = isSubstantiveBody(body, title);

  if (resolved('linked_spec')) return { level: 'high', basis: 'linked_spec' };
  if (resolved('linked_issue') && substantive) return { level: 'high', basis: 'issue_and_description' };
  if (substantive) return { level: 'medium', basis: 'description_only' };
  if (resolved('linked_issue')) return { level: 'medium', basis: 'issue_only' };
  if (resolved('spec_in_diff')) return { level: 'medium', basis: 'spec_in_diff' };
  return { level: 'low', basis: 'indirect_only' };
}

const LEVELS: IntentConfidence[] = ['low', 'medium', 'high'];

/** The model may only LOWER the level (never raise it). */
export function applyAmbiguity(
  level: IntentConfidence,
  ambiguity: 'clear' | 'partial' | 'unclear',
): { level: IntentConfidence; downgraded: boolean } {
  if (ambiguity !== 'unclear') return { level, downgraded: false };
  const idx = LEVELS.indexOf(level);
  const newLevel = LEVELS[Math.max(0, idx - 1)] ?? level;
  return { level: newLevel, downgraded: newLevel !== level };
}

// ---------------------------------------------------------------------------
// Input hash
// ---------------------------------------------------------------------------

/** sha256(promptVersion + title + "\0" + body + "\0" + headSha) — no network. */
export function computeInputHash(title: string, body: string | null | undefined, headSha: string): string {
  const h = createHash('sha256');
  h.update(String(INTENT_PROMPT_VERSION));
  h.update(title);
  h.update('\0');
  h.update(body ?? '');
  h.update('\0');
  h.update(headSha);
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// Classifier output normalization
// ---------------------------------------------------------------------------

export interface RawClassification {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
}

export interface NormalizedClassification {
  intent: string;
  inScope: string[];
  outOfScope: string[];
}

function normalizeScopeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const capped = trimmed.slice(0, MAX_SCOPE_ITEM_CHARS);
    const key = capped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(capped);
    if (out.length >= MAX_SCOPE_ITEMS) break;
  }
  return out;
}

/** Trim, drop empties, dedupe (case-insensitive) and cap the classifier's raw output. */
export function normalizeClassification(raw: RawClassification): NormalizedClassification {
  return {
    intent: raw.intent.trim().slice(0, MAX_INTENT_CHARS),
    inScope: normalizeScopeList(raw.in_scope),
    outOfScope: normalizeScopeList(raw.out_of_scope),
  };
}

// ---------------------------------------------------------------------------
// Row → DTO mapping (field by field, no spread — onion-architecture §7)
// ---------------------------------------------------------------------------

/** `stale` is computed here (not stored): the row's own input_hash vs the
    hash computed from the PR's CURRENT title/body/head_sha. */
export function toIntentRecordDto(row: IntentRow, currentHash: string): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    pr_id: row.prId,
    confidence: row.confidence as IntentConfidence,
    confidence_basis: row.confidenceBasis as IntentConfidenceBasis,
    downgraded: row.downgraded,
    sources: row.sources,
    head_sha: row.headSha,
    stale: row.inputHash !== currentHash,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    generated_at: row.generatedAt.toISOString(),
  };
}
