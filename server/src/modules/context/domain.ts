import {
  CHARS_PER_TOKEN,
  DEVDIGEST_NAMESPACE,
  DEVDIGEST_ROOT,
  DOC_EXCLUDED_DIRS,
  MAX_DEVDIGEST_DOC_BYTES,
  MAX_DOC_PATH_CHARS,
  PROJECT_CONTEXT_UNAVAILABLE,
} from './constants.js';

/**
 * Project Context Folder (SPEC-01) — pure rules and API DTOs.
 * No I/O, no Zod/Fastify/Drizzle: schemas.ts mirrors these types with Zod.
 */

export type DocSource = 'readme' | 'insights' | 'specs' | 'docs' | 'devdigest';

const EXCLUDED = new Set<string>(DOC_EXCLUDED_DIRS);

/**
 * Classify a POSIX path relative to the clone root as a discoverable doc, or null.
 *  - rejects: empty, absolute, `\`, `..`/empty segments, an excluded dir segment, non-`.md`, too long
 *  - `INSIGHTS.md` (any depth) → insights
 *  - first DIRECTORY segment `specs` / `docs` → that label
 *  - `README.md` at the root or one folder deep → readme
 */
export function classifyDocPath(path: string): DocSource | null {
  if (!path || path.length > MAX_DOC_PATH_CHARS) return null;
  if (path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return null;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (segments[0] === DEVDIGEST_NAMESPACE) {
    // DevDigest-owned namespace: only `.devdigest/specs/**.md` is a doc, and never a repo doc.
    const last = segments[segments.length - 1]!;
    return path.startsWith(DEVDIGEST_ROOT) && last.toLowerCase().endsWith('.md') ? 'devdigest' : null;
  }
  const basename = segments[segments.length - 1]!;
  const dirs = segments.slice(0, -1);
  if (dirs.some((d) => EXCLUDED.has(d))) return null;
  if (!basename.toLowerCase().endsWith('.md')) return null;

  if (basename === 'INSIGHTS.md') return 'insights';
  const docDir = dirs.find((d) => d === 'specs' || d === 'docs');
  if (docDir === 'specs' || docDir === 'docs') return docDir;
  if (basename === 'README.md' && dirs.length <= 1) return 'readme';
  return null;
}

/** First path segment is `.devdigest` (DevDigest-owned namespace; never a repo doc). */
export function isDevdigestNamespace(path: string): boolean {
  return path.split('/')[0] === DEVDIGEST_NAMESPACE;
}

/** Distinct paths, first occurrence wins, order kept (brief spec docs across agents). */
export function unionAttachedPaths(rows: readonly { path: string }[]): string[] {
  return [...new Set(rows.map((r) => r.path))];
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

export type LeftOutReason = 'too_large' | 'over_cap' | 'missing';
export interface AttachedDocRead { path: string; content: string | null }
export interface IncludedDoc { path: string; tokens: number; content: string }
export interface LeftOutDoc { path: string; tokens: number | null; reason: LeftOutReason }
export interface ContextSelection { included: IncludedDoc[]; left_out: LeftOutDoc[]; total_tokens: number }

/**
 * Pick whole docs, in attach order, under `cap` estimated tokens. Never truncates.
 * A doc alone over the cap is skipped (`too_large`) and selection continues; the first doc that
 * would push the total over the cap stops selection: it and every later doc are left out.
 */
export function selectForRun(docs: readonly AttachedDocRead[], cap: number): ContextSelection {
  const included: IncludedDoc[] = [];
  const left_out: LeftOutDoc[] = [];
  let total = 0;
  let capHit = false;
  for (const doc of docs) {
    if (doc.content === null) {
      left_out.push({ path: doc.path, tokens: null, reason: 'missing' });
      continue;
    }
    const tokens = estimateTokens(doc.content);
    if (tokens > cap) {
      left_out.push({ path: doc.path, tokens, reason: 'too_large' });
      continue;
    }
    if (capHit || total + tokens > cap) {
      capHit = true;
      left_out.push({ path: doc.path, tokens, reason: 'over_cap' });
      continue;
    }
    total += tokens;
    included.push({ path: doc.path, tokens, content: doc.content });
  }
  return { included, left_out, total_tokens: total };
}

// ---------- API DTOs (snake_case) ----------

export interface ContextDoc { path: string; source: DocSource; tokens: number; attached_agents: number }
export type ContextRepoState =
  | { status: 'ready' }
  | { status: 'not_cloned' }
  | { status: 'index_failed'; reason: string | null }
  | { status: 'index_degraded'; reason: string | null };
/** `docs` is empty only when `not_cloned` (AC-5); sorted by path. */
export interface ContextDocList { repo_id: string; state: ContextRepoState; docs: ContextDoc[] }
export interface ContextDocContent extends ContextDoc { content: string }
export interface AgentContextDoc {
  path: string;
  /** 0-based attach order. */
  position: number;
  /** missing = not in the discovered set / unreadable at the synced commit. */
  status: 'ok' | 'missing';
  source: DocSource | null;
  tokens: number | null;
}
export interface AgentContextDocs { agent_id: string; repo_id: string; docs: AgentContextDoc[] }
export type ProjectContextTrace =
  | { status: 'unavailable'; reason: typeof PROJECT_CONTEXT_UNAVAILABLE; attached: string[] }
  | {
      status: 'ok';
      cap_tokens: number;
      total_tokens: number;
      included: { path: string; tokens: number }[];
      left_out: LeftOutDoc[];
      /** Attached paths that are in the PR's changed files. */
      changed_by_pr: string[];
      /** Attached repo docs not read because the repo is not cloned, while >=1 attached .devdigest doc was. */
      repo_unavailable?: string[];
    };
/** What the executor gets per run; the service returns null when the agent has no attachments (AC-11). */
export interface RunProjectContext { specs: string[]; trace: ProjectContextTrace; logLine: string }

// ---------- DevDigest-owned docs (SPEC-03) ----------

export type DevdigestNameRule =
  | 'empty'
  | 'dot_dot'
  | 'backslash'
  | 'leading_slash'
  | 'line_break'
  | 'too_long'
  | 'empty_segment';
export type DevdigestDocErrorReason =
  | 'invalid_name'
  | 'exists'
  | 'limit_reached'
  | 'too_large'
  | 'not_markdown'
  | 'not_text';
/** `details` of every 409/422 from the devdigest routes (client maps `reason`/`rule` to i18n). */
export interface DevdigestDocErrorDetails {
  reason: DevdigestDocErrorReason;
  rule?: DevdigestNameRule;
  path?: string;
  doc_id?: string;
  limit?: number;
}

/**
 * `folder` = devdigest-relative folder ('' = root), `name` = user text (may contain '/').
 * Rules are checked in a fixed order on the raw text (SPEC-03/AC-5).
 */
export function buildDevdigestPath(
  folder: string,
  name: string,
  opts: { appendMd: boolean },
): { ok: true; path: string } | { ok: false; rule: DevdigestNameRule } {
  if (name === '') return { ok: false, rule: 'empty' };
  if (folder.includes('..') || name.includes('..')) return { ok: false, rule: 'dot_dot' };
  if (folder.includes('\\') || name.includes('\\')) return { ok: false, rule: 'backslash' };
  if (name.startsWith('/') || folder.startsWith('/')) return { ok: false, rule: 'leading_slash' };
  if (/[\r\n]/.test(folder) || /[\r\n]/.test(name)) return { ok: false, rule: 'line_break' };
  const rel = folder === '' ? name : `${folder}/${name}`;
  if (rel.split('/').some((seg) => seg === '' || seg === '.')) return { ok: false, rule: 'empty_segment' };
  const withExt = opts.appendMd && !rel.toLowerCase().endsWith('.md') ? `${rel}.md` : rel;
  const path = DEVDIGEST_ROOT + withExt;
  if (path.length > MAX_DOC_PATH_CHARS) return { ok: false, rule: 'too_long' };
  return { ok: true, path };
}

/** 'specs/a.md' -> '.devdigest/specs/specs/a.md'; 'README.md' -> '.devdigest/specs/README.md'. */
export function mirrorToDevdigest(repoPath: string): string {
  return DEVDIGEST_ROOT + repoPath;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Size is checked on the decoded bytes BEFORE text decoding; invalid UTF-8 or a NUL -> not_text. */
export function decodeUploadText(
  contentBase64: string,
): { ok: true; text: string } | { ok: false; reason: 'too_large' | 'not_text' } {
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length > MAX_DEVDIGEST_DOC_BYTES) return { ok: false, reason: 'too_large' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'not_text' };
  }
  if (text.includes('\u0000')) return { ok: false, reason: 'not_text' };
  return { ok: true, text };
}

export interface DevdigestDocMeta {
  id: string;
  path: string;
  tokens: number;
  copied_from: string | null;
  updated_at: string;
}
/** GET /repos/:id/devdigest-docs — also carries the page footer/notice data. */
export interface DevdigestDocList {
  repo_id: string;
  /** Sorted by path (byte order). */
  docs: DevdigestDocMeta[];
  limit: number;
  /** Repo-intel index updatedAt; null when never indexed. */
  synced_at: string | null;
  /** Walker .md paths under the repo's own .devdigest/ (0 when not cloned). */
  ignored_repo_paths: number;
}
export interface DevdigestDoc extends DevdigestDocMeta {
  repo_id: string;
  content: string;
  /** Workspace agents with it attached for this repo. */
  used_by: { id: string; name: string }[];
}
export interface DevdigestCopyResult { created: boolean; doc: DevdigestDoc }
export interface DevdigestDeleteResult { deleted: string; detached_agents: number }
