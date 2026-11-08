import {
  CHARS_PER_TOKEN,
  DOC_EXCLUDED_DIRS,
  MAX_DOC_PATH_CHARS,
  PROJECT_CONTEXT_UNAVAILABLE,
} from './constants.js';

/**
 * Project Context Folder (SPEC-01) — pure rules and API DTOs.
 * No I/O, no Zod/Fastify/Drizzle: schemas.ts mirrors these types with Zod.
 */

export type DocSource = 'readme' | 'insights' | 'specs' | 'docs';

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
    };
/** What the executor gets per run; the service returns null when the agent has no attachments (AC-11). */
export interface RunProjectContext { specs: string[]; trace: ProjectContextTrace; logLine: string }
