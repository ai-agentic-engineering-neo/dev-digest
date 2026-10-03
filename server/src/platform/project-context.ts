import type { ContextDocType, SpecReadEntry } from '@devdigest/shared';

/**
 * Pure Project Context rules — glob matching, document typing, path
 * validation, effective-list resolution and the token budget. No I/O. Lives in
 * platform (not modules/context) because two modules need the same rules: the
 * context module (editor-facing) and the reviews run-executor (run time).
 */

/** Directory segments that give a document its type, checked deepest-first. */
const TYPE_SEGMENTS = ['specs', 'docs', 'insights'] as const;

/**
 * Compile a glob to an anchored RegExp. Supports `**` (any depth, including
 * zero directories when followed by `/`), `*`, `?` and `{a,b}` alternation —
 * enough for the default `**\/{specs,docs,insights}/**\/*.md`. Dot-files and
 * dot-directories match like any other name (so `.devdigest/specs/` is found).
 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let i = 0;
  let inGroup = false;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      inGroup = true;
      re += '(?:';
    } else if (c === '}' && inGroup) {
      inGroup = false;
      re += ')';
    } else if (c === ',' && inGroup) {
      re += '|';
    } else {
      re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
    i += 1;
  }
  return new RegExp(`^${re}$`);
}

/** Type = the deepest `specs` / `docs` / `insights` directory segment, else `other`. */
export function docTypeFor(path: string): ContextDocType {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const seg = dirs[i]!;
    if ((TYPE_SEGMENTS as readonly string[]).includes(seg)) return seg as ContextDocType;
  }
  return 'other';
}

/** `docs/specs/a.md` → `{ dir: 'docs/specs/', name: 'a.md' }`. */
export function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  return idx === -1
    ? { dir: '', name: path }
    : { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

/**
 * Validate an attachment path: repo-relative, POSIX, `.md`, no `..` or empty
 * segments. Returns the reason it is rejected, or null when it is acceptable.
 * Resolution inside the clone is re-checked at read time.
 */
export function invalidContextPathReason(path: string): string | null {
  if (path.length === 0 || path.length > 512) return 'path must be 1–512 characters';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'path must be repo-relative';
  if (path.includes('\\') || path.includes('\0')) return 'path must use forward slashes';
  if (!path.toLowerCase().endsWith('.md')) return 'path must end in .md';
  const segs = path.split('/');
  if (segs.some((s) => s === '..' || s === '.' || s === '')) return 'path must not contain . / .. / empty segments';
  return null;
}

/** Drop duplicates, keeping each path's first occurrence (order preserved). */
export function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/** One linked skill's contribution to an agent's effective context. */
export interface SkillContextSource {
  skillId: string;
  skillName: string;
  paths: readonly string[];
}

/** A path in an agent's effective, deduplicated context list, with its origin. */
export interface EffectiveContextPath {
  path: string;
  source: 'agent' | 'skill';
  skillId?: string;
  skillName?: string;
}

/**
 * The effective document order for a run: the agent's own paths in their saved
 * order, then each enabled skill's paths in skill-link order. A path that
 * appears more than once keeps only its first occurrence (and its origin).
 */
export function effectiveContextList(
  own: readonly string[],
  skills: readonly SkillContextSource[],
): EffectiveContextPath[] {
  const seen = new Set<string>();
  const out: EffectiveContextPath[] = [];
  for (const path of own) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, source: 'agent' });
  }
  for (const sk of skills) {
    for (const path of sk.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, source: 'skill', skillId: sk.skillId, skillName: sk.skillName });
    }
  }
  return out;
}

/** A document read for a run, before the budget is applied. */
export interface ReadContextDoc extends EffectiveContextPath {
  /** Document text, or null when the path did not exist at the target ref. */
  content: string | null;
  tokens: number | null;
}

/**
 * Apply the total token budget in effective order. The first present document
 * that would push the running total past `budget` — and every present document
 * after it — is `skipped_budget`; later, smaller documents are deliberately not
 * back-filled, so "order matters" stays predictable. Missing documents never
 * consume budget.
 */
export function applyContextBudget(
  docs: readonly ReadContextDoc[],
  budget: number,
): { included: { path: string; content: string }[]; entries: SpecReadEntry[]; totalTokens: number } {
  const included: { path: string; content: string }[] = [];
  const entries: SpecReadEntry[] = [];
  let total = 0;
  let overBudget = false;
  for (const d of docs) {
    const base = {
      path: d.path,
      tokens: d.tokens,
      source: d.source,
      ...(d.skillName ? { skill_name: d.skillName } : {}),
    };
    if (d.content == null) {
      entries.push({ ...base, status: 'missing' });
      continue;
    }
    const tokens = d.tokens ?? 0;
    if (overBudget || total + tokens > budget) {
      overBudget = true;
      entries.push({ ...base, status: 'skipped_budget' });
      continue;
    }
    total += tokens;
    included.push({ path: d.path, content: d.content });
    entries.push({ ...base, status: 'included' });
  }
  return { included, entries, totalTokens: total };
}

/** The run-log line summarising resolved project context (AC-51). */
export function contextLogLine(entries: readonly SpecReadEntry[], totalTokens: number): string {
  const included = entries.filter((e) => e.status === 'included').length;
  const missing = entries.filter((e) => e.status === 'missing').length;
  const skipped = entries.filter((e) => e.status === 'skipped_budget').length;
  return `project context: ${included} doc(s) (+~${totalTokens} tokens), ${missing} missing, ${skipped} skipped (budget)`;
}
