/** Pure functions of the project-context module: no I/O, no framework. */
import type { SpecFile, SpecKind } from '@devdigest/shared';
import {
  DISCOVERY_ROOTS,
  MAX_PATH_CHARS,
  PROJECT_CONTEXT_FILE_MAX_CHARS,
  PROJECT_CONTEXT_MAX_TOKEN_RUN_CHARS,
} from './constants.js';

const LONG_UNSPACED_RUN = new RegExp(`\\S{${PROJECT_CONTEXT_MAX_TOKEN_RUN_CHARS + 1},}`);

/**
 * Token count that cannot be turned into a DoS by the document: text with a very long
 * whitespace-free run (BPE is quadratic on it) gets the chars/4 approximation.
 */
export function safeTokenCount(count: (text: string) => number, text: string): number {
  if (LONG_UNSPACED_RUN.test(text)) return Math.ceil(text.length / 4);
  return count(text);
}

/** Expand `{a,b}` groups (nested allowed) into separate globs; git pathspecs have no braces. */
export function expandBraces(glob: string): string[] {
  const open = glob.indexOf('{');
  if (open < 0) return [glob];
  let depth = 0;
  let close = -1;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === '{') depth++;
    else if (glob[i] === '}' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return [glob];
  const parts: string[] = [];
  let level = 0;
  let start = open + 1;
  for (let i = open + 1; i < close; i++) {
    if (glob[i] === '{') level++;
    else if (glob[i] === '}') level--;
    else if (glob[i] === ',' && level === 0) {
      parts.push(glob.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(glob.slice(start, close));
  const head = glob.slice(0, open);
  const tail = glob.slice(close + 1);
  return parts.flatMap((p) => expandBraces(`${head}${p}${tail}`));
}

/** Git `:(glob)` pathspec bodies for the configured glob (prefix is added by the adapter). */
export function globToPathspecs(glob: string): string[] {
  return [...new Set(expandBraces(glob.trim()))].filter((g) => g.length > 0);
}

/** Relative, no traversal, no NUL, no leading dash, bounded (same rules as the git adapter). */
export function isSafePath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_CHARS) return false;
  if (path.includes('\0') || path.startsWith('-') || path.startsWith('/')) return false;
  return !path.split('/').some((seg) => seg === '..' || seg === '');
}

function hasControlChars(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/** Excluded from discovery: node_modules, any dot-folder (or dot-file), control chars, unsafe paths. */
export function isExcludedPath(path: string): boolean {
  if (!isSafePath(path) || hasControlChars(path)) return true;
  return path.split('/').some((seg) => seg === 'node_modules' || seg.startsWith('.'));
}

/** Nearest ancestor folder that is one of specs, docs, insights; null when none. */
export function kindOf(path: string): SpecKind | null {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const seg = dirs[i]!;
    if ((DISCOVERY_ROOTS as readonly string[]).includes(seg)) return seg as SpecKind;
  }
  return null;
}

export interface ListedFile {
  path: string;
  size: number;
  tokens?: number | null;
  tooLarge: boolean;
  /** Git blob sha of the listed version. */
  blob: string;
}

export type OverrideTextIssue = 'empty' | 'too_long' | 'nul';

/** Why a text cannot be stored as an override (AC-47); null = acceptable. */
export function overrideTextIssue(text: string): OverrideTextIssue | null {
  if (text.length === 0) return 'empty';
  if (text.length > PROJECT_CONTEXT_FILE_MAX_CHARS) return 'too_long';
  if (text.includes('\0')) return 'nul';
  return null;
}

export function toSpecFile(
  file: ListedFile,
  usage?: { agents: number; skills: number; agentsUsing?: number },
  override?: { tokens: number },
): SpecFile {
  return {
    path: file.path,
    size: file.size,
    kind: kindOf(file.path),
    tokens: file.tooLarge ? null : override ? override.tokens : (file.tokens ?? null),
    modified: !!override && !file.tooLarge,
    too_large: file.tooLarge,
    agent_count: usage?.agents ?? 0,
    skill_count: usage?.skills ?? 0,
    agents_using: usage?.agentsUsing ?? 0,
  };
}

export type AttachIssueReason = 'duplicate' | 'unknown' | 'too_large';
export interface AttachIssue {
  path: string;
  reason: AttachIssueReason;
}

/** Every path once, listed, and attachable (not too large). Empty list = valid. */
export function validateAttachPaths(
  paths: string[],
  listing: Map<string, { tooLarge: boolean }>,
): AttachIssue[] {
  const issues: AttachIssue[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) {
      issues.push({ path, reason: 'duplicate' });
      continue;
    }
    seen.add(path);
    const file = listing.get(path);
    if (!file) issues.push({ path, reason: 'unknown' });
    else if (file.tooLarge) issues.push({ path, reason: 'too_large' });
  }
  return issues;
}

export interface OrderedDoc {
  path: string;
  /** 'agent' or 'skill:<name>'. */
  source: string;
}

/**
 * Agent paths in stored order, then each (enabled) skill's paths in the order given;
 * a path already seen is skipped, so the first owner wins.
 */
export function resolveContextOrder(
  agentPaths: string[],
  skills: { name: string; paths: string[] }[],
): OrderedDoc[] {
  const out: OrderedDoc[] = [];
  const seen = new Set<string>();
  const push = (path: string, source: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, source });
  };
  for (const p of agentPaths) push(p, 'agent');
  for (const s of skills) for (const p of s.paths) push(p, `skill:${s.name}`);
  return out;
}

/** Longest prefix of `text` whose token count is <= max (binary search on length). */
export function truncateToTokens(
  text: string,
  max: number,
  count: (t: string) => number,
): { text: string; truncated: boolean } {
  if (count(text) <= max) return { text, truncated: false };
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid)) <= max) lo = mid;
    else hi = mid - 1;
  }
  return { text: text.slice(0, lo), truncated: true };
}

/** Keep documents in order until one would exceed `max`; it and every later one are skipped. */
export function applyPromptBudget<T extends { tokens: number }>(
  docs: T[],
  max: number,
): { kept: T[]; skipped: T[] } {
  const kept: T[] = [];
  let total = 0;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    if (total + d.tokens > max) return { kept, skipped: docs.slice(i) };
    total += d.tokens;
    kept.push(d);
  }
  return { kept, skipped: [] };
}

/** NUL or the replacement character: the blob is not UTF-8 text (D16). */
export function isProbablyBinary(text: string): boolean {
  return text.includes('\0') || text.includes('�');
}

export const attachedLine = (path: string, tokens: number, source: string, modified = false): string =>
  `Context attached: ${path} (${tokens} tokens, ${source}${modified ? ', modified locally' : ''})`;
export const skippedLine = (path: string, reason: string): string =>
  `Context skipped: ${path} — ${reason}`;
export const summaryLine = (count: number, tokens: number): string =>
  `Context: ${count} document${count === 1 ? '' : 's'}, ${tokens} tokens`;
