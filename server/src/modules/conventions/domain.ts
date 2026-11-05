import type { ConventionCandidate, SkillType } from '@devdigest/shared';
import { toSkillSlug } from '../_shared/skill-name.js';

/**
 * Conventions Extractor — pure rules. The model proposes house-rules with
 * evidence; everything that decides what is KEPT lives here and is code:
 * the evidence file must exist, the snippet must really be in it, and the
 * line numbers are computed from that match (never taken from the model).
 */

/** A candidate as the model returns it (before grounding). */
export interface RawConventionCandidate {
  category: string;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  confidence: number;
}

/** A candidate whose evidence was verified against the real file. */
export interface GroundedConvention {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  lineStart: number;
  lineEnd: number;
  confidence: number;
}

export type GroundingFailure = 'unsafe_path' | 'file_not_found' | 'snippet_not_found' | 'snippet_too_short';

/** Config files sampled by name (root + each sampled file's top-level folder). */
export const CONFIG_FILE_NAMES = [
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
  'biome.json',
] as const;

/** A snippet shorter than this (after whitespace collapse) proves nothing (`}`, `});`). */
export const MIN_SNIPPET_CHARS = 12;

/** Repo-relative path that cannot escape the clone (no absolute, no `..`, no drive). */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return !path.split(/[\\/]/).some((seg) => seg === '..');
}

/** `./src/a.ts` / `src\a.ts` → `src/a.ts`. */
export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

const collapse = (line: string): string => line.trim().replace(/\s+/g, ' ');

/**
 * Locate `snippet` in `content`, tolerant to indentation / inner whitespace and
 * blank lines, but requiring every non-blank snippet line to match a file line
 * in order. Returns 1-based inclusive line numbers, or null when not present.
 */
export function locateSnippet(content: string, snippet: string): { lineStart: number; lineEnd: number } | null {
  const want = snippet.split(/\r?\n/).map(collapse).filter(Boolean);
  if (want.length === 0) return null;
  const have = content.split(/\r?\n/).map(collapse);
  for (let i = 0; i < have.length; i++) {
    if (have[i] !== want[0]) continue;
    let k = 1;
    let j = i + 1;
    let last = i;
    while (k < want.length && j < have.length) {
      if (have[j] === '') {
        j++;
        continue;
      }
      if (have[j] !== want[k]) break;
      last = j;
      k++;
      j++;
    }
    if (k === want.length) return { lineStart: i + 1, lineEnd: last + 1 };
  }
  return null;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Normalized rule text for de-duplication (case / punctuation / spacing insensitive). */
export function ruleKey(rule: string): string {
  return rule.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Ground one model candidate against the file content (`null` = file missing).
 * Returns the verified convention or the reason it was dropped.
 */
export function groundCandidate(
  raw: RawConventionCandidate,
  content: string | null,
): { ok: true; value: GroundedConvention } | { ok: false; reason: GroundingFailure } {
  const path = normalizeRepoPath(raw.evidence_path);
  if (!isSafeRelativePath(path)) return { ok: false, reason: 'unsafe_path' };
  if (content === null) return { ok: false, reason: 'file_not_found' };
  if (collapse(raw.evidence_snippet.replace(/\r?\n/g, ' ')).length < MIN_SNIPPET_CHARS) {
    return { ok: false, reason: 'snippet_too_short' };
  }
  const at = locateSnippet(content, raw.evidence_snippet);
  if (!at) return { ok: false, reason: 'snippet_not_found' };
  // Store the REAL lines from the file, so the UI never shows model-paraphrased code.
  const realSnippet = content.split(/\r?\n/).slice(at.lineStart - 1, at.lineEnd).join('\n');
  return {
    ok: true,
    value: {
      category: raw.category.trim() || 'general',
      rule: raw.rule.trim(),
      evidencePath: path,
      evidenceSnippet: realSnippet,
      lineStart: at.lineStart,
      lineEnd: at.lineEnd,
      confidence: clamp01(raw.confidence),
    },
  };
}

/** Drop duplicates of each other and of rules the user already accepted. */
export function dedupeConventions(items: GroundedConvention[], acceptedRules: string[]): GroundedConvention[] {
  const seen = new Set(acceptedRules.map(ruleKey));
  const out: GroundedConvention[] = [];
  for (const it of items) {
    const key = ruleKey(it.rule);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** `src/a.ts:23-31` (or `:23` for one line). */
export function evidenceRef(c: Pick<ConventionCandidate, 'evidence_path' | 'line_start' | 'line_end'>): string {
  if (c.line_start == null) return c.evidence_path;
  const range = c.line_end != null && c.line_end !== c.line_start ? `${c.line_start}-${c.line_end}` : `${c.line_start}`;
  return `${c.evidence_path}:${range}`;
}

export interface ConventionsSkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  evidence_files: string[];
  convention_ids: string[];
}

/** Longest code fence inside `text`, so the wrapping fence is always longer. */
function fenceFor(text: string): string {
  const runs = text.match(/`{3,}/g) ?? [];
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 2);
  return '`'.repeat(longest + 1);
}

/**
 * Merge accepted conventions into ONE `<repo>-conventions` skill (design:
 * "Create skill from conventions"). Each rule becomes a section with its
 * verified evidence, so the reviewer can cite the house pattern.
 */
export function buildConventionsSkillDraft(repoName: string, accepted: ConventionCandidate[]): ConventionsSkillDraft {
  const repoSlug = toSkillSlug(repoName) || 'repo';
  const name = `${repoSlug}-conventions`.slice(0, 64).replace(/-+$/, '');
  const lines: string[] = [
    `# ${name}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];
  for (const c of accepted) {
    const fence = fenceFor(c.evidence_snippet);
    lines.push(
      '',
      `## ${toSkillSlug(c.rule).slice(0, 48).replace(/-+$/, '') || 'rule'}`,
      c.rule,
      '',
      `Detected in \`${evidenceRef(c)}\`:`,
      fence,
      c.evidence_snippet,
      fence,
    );
  }
  return {
    name,
    description: `Use when reviewing changes to ${repoName}: enforces ${accepted.length} house ${
      accepted.length === 1 ? 'convention' : 'conventions'
    } extracted from the codebase.`,
    type: 'convention',
    body: lines.join('\n') + '\n',
    evidence_files: [...new Set(accepted.map((c) => c.evidence_path))],
    convention_ids: accepted.map((c) => c.id),
  };
}
