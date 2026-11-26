import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionEvidence,
  ConventionScan,
  ConventionStatus,
} from '@devdigest/shared';
import {
  MAX_EVIDENCE_PER_RULE,
  MAX_FILE_CHARS,
  MAX_FILE_LINES,
  MAX_SNIPPET_LINES,
  MIN_CONFIDENCE,
  MIN_SNIPPET_CHARS,
} from './constants.js';

/**
 * Pure helpers for the Conventions Extractor: the sample the model sees, the
 * evidence gate that decides which of its claims survive, rule dedupe, and the
 * skill body built from accepted rules. No I/O, no model, no DB.
 */

// ---- the `details` jsonb shape ---------------------------------------------

export interface ConventionScanMeta {
  at: string;
  commit_sha: string | null;
  files_sampled: number;
  model: string;
}

/** What `conventions.details` holds (validated by the repository on read). */
export interface ConventionDetails {
  category?: ConventionCategory;
  bad_example?: string | null;
  evidence: ConventionEvidence[];
  scan?: ConventionScanMeta;
  skill_ids?: string[];
}

/** Triage state from the two columns (pending = undecided). */
export function deriveStatus(accepted: boolean, rejectedAt: Date | null): ConventionStatus {
  if (accepted) return 'accepted';
  return rejectedAt ? 'rejected' : 'pending';
}

/** A convention as the service sees it (no Drizzle types). */
export interface ConventionRecord {
  id: string;
  repoId: string | null;
  rule: string;
  confidence: number;
  accepted: boolean;
  rejectedAt: Date | null;
  /** Flat columns; for rows written before `details` existed they are the only evidence. */
  evidencePath: string | null;
  evidenceSnippet: string | null;
  details: ConventionDetails;
}

/** The repo fields this feature needs. */
export interface RepoRefRecord {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

/** Column patch the service computed for one convention. */
export interface ConventionPatch {
  rule?: string;
  accepted?: boolean;
  rejectedAt?: Date | null;
  details?: ConventionDetails;
}

/** Record → contract DTO; `skillNames` resolves details.skill_ids. */
export function toCandidateDto(
  r: ConventionRecord,
  skillNames: ReadonlyMap<string, string>,
): ConventionCandidate {
  const first = r.details.evidence[0];
  return {
    id: r.id,
    rule: r.rule,
    evidence_path: first?.path ?? r.evidencePath ?? '',
    evidence_snippet: first?.snippet ?? r.evidenceSnippet ?? '',
    confidence: r.confidence,
    accepted: r.accepted,
    status: deriveStatus(r.accepted, r.rejectedAt),
    category: r.details.category ?? 'general',
    bad_example: r.details.bad_example ?? null,
    evidence: r.details.evidence,
    commit_sha: r.details.scan?.commit_sha ?? null,
    skill_names: (r.details.skill_ids ?? [])
      .map((id) => skillNames.get(id))
      .filter((n): n is string => !!n),
  };
}

/** The newest scan among a repo's rows (scan meta lives in each row's details). */
export function latestScan(records: ConventionRecord[]): ConventionScan | null {
  let best: ConventionScanMeta | undefined;
  for (const r of records) {
    const s = r.details.scan;
    if (s && (!best || s.at > best.at)) best = s;
  }
  return best ?? null;
}

// ---- sampling --------------------------------------------------------------

export interface SampledFile {
  path: string;
  lines: string[];
  truncated: boolean;
}

/** Truncate to the per-file caps and split once. */
export function toSampledFile(path: string, raw: string): SampledFile {
  const byChars = raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) : raw;
  const all = byChars.split(/\r?\n/); // CRLF files must not leak \r into snippets
  const lines = all.slice(0, MAX_FILE_LINES);
  return { path, lines, truncated: lines.length < all.length || byChars.length < raw.length };
}

/**
 * One file for the prompt, with 1-based line numbers. The gutter is what makes
 * a citation mechanically checkable afterwards.
 */
export function renderSample(file: SampledFile): string {
  const body = file.lines.map((l, i) => `${i + 1}\t${l}`).join('\n');
  return `--- FILE: ${file.path} ---\n${body}${file.truncated ? '\n… (truncated)' : ''}`;
}

/**
 * Render files until `maxChars` would be exceeded. Returns the files that made
 * it in — only those may be cited, so the gate checks against this list.
 */
export function renderSamples(
  files: SampledFile[],
  maxChars: number,
): { rendered: string; included: SampledFile[] } {
  const blocks: string[] = [];
  const included: SampledFile[] = [];
  let used = 0;
  for (const f of files) {
    const block = renderSample(f);
    if (used + block.length > maxChars) break;
    blocks.push(block);
    included.push(f);
    used += block.length + 2;
  }
  return { rendered: blocks.join('\n\n'), included };
}

// ---- the evidence gate -----------------------------------------------------

/** One model candidate before verification (mirrors ExtractionSchema). */
export interface RawCandidate {
  rule: string;
  evidence: { path: string; line?: number | null; snippet: string }[];
  bad_example?: string | null;
  category: string;
  confidence: number;
}

/** A rule whose evidence was found in the files; snippets are the file's bytes. */
export interface VerifiedRule {
  rule: string;
  category: ConventionCategory;
  bad_example: string | null;
  evidence: ConventionEvidence[];
  confidence: number;
}

export type DropReason = 'empty_rule' | 'low_confidence' | 'no_evidence';

export type VerifyResult = { ok: true; rule: VerifiedRule } | { ok: false; reason: DropReason };

const CATEGORIES: readonly ConventionCategory[] = [
  'naming',
  'structure',
  'errors',
  'imports',
  'typing',
  'testing',
  'api',
  'general',
];

/** Whitespace- and case-insensitive comparison key for a code line. */
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Match a cited path to a sampled one: exact first, then a UNIQUE suffix match
 * (`./src/a.ts`, `a.ts`). Ambiguous suffixes are not resolved — guessing would
 * defeat the gate.
 */
export function resolveFile(
  files: ReadonlyMap<string, SampledFile>,
  cited: string,
): SampledFile | undefined {
  if (!cited) return undefined;
  const clean = cited.trim().replace(/^\.?\//, '').split(':')[0]!;
  const exact = files.get(clean);
  if (exact) return exact;
  const matches = [...files.values()].filter((f) => f.path.endsWith(`/${clean}`));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Index of the line containing the snippet head, nearest to the model's own
 * claim so a repeated line resolves to the one it meant. -1 when absent.
 */
export function findLine(lines: string[], head: string, claimed: number | null): number {
  const needle = norm(head);
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = norm(lines[i]!);
    if (line && line.includes(needle)) hits.push(i);
  }
  if (hits.length === 0) return -1;
  if (claimed == null) return hits[0]!;
  const target = claimed - 1;
  return hits.reduce((best, i) => (Math.abs(i - target) < Math.abs(best - target) ? i : best));
}

/** Strip the common leading indentation so a nested snippet reads cleanly. */
export function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return min > 0 ? lines.map((l) => l.slice(min)) : lines;
}

/**
 * Verify one evidence item. The path must have been sampled, the snippet head
 * must be substantial and occur in that file. A wrong line number is
 * corrected; the returned snippet is sliced FROM THE FILE.
 */
export function verifyEvidence(
  files: ReadonlyMap<string, SampledFile>,
  ev: RawCandidate['evidence'][number],
): ConventionEvidence | null {
  const file = resolveFile(files, ev.path);
  if (!file) return null;
  const snippetLines = (ev.snippet ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\t/, '')) // the model sometimes echoes the gutter
    .filter((l) => l.trim().length > 0);
  const head = snippetLines[0];
  if (!head || norm(head).replace(/\s/g, '').length < MIN_SNIPPET_CHARS) return null;
  const idx = findLine(file.lines, head, ev.line ?? null);
  if (idx === -1) return null;
  const span = Math.min(Math.max(snippetLines.length, 1), MAX_SNIPPET_LINES);
  const slice = file.lines.slice(idx, idx + span);
  return {
    path: file.path,
    line_start: idx + 1,
    line_end: idx + slice.length,
    snippet: dedent(slice).join('\n').trimEnd(),
  };
}

/** Verify a candidate: keep only its evidence that is really in the files. */
export function verifyCandidate(
  files: ReadonlyMap<string, SampledFile>,
  c: RawCandidate,
): VerifyResult {
  const rule = c.rule?.trim();
  if (!rule) return { ok: false, reason: 'empty_rule' };
  const confidence = Math.min(1, Math.max(0, c.confidence ?? 0));
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: 'low_confidence' };
  const evidence = uniqueEvidence(
    (c.evidence ?? []).map((e) => verifyEvidence(files, e)).filter((e): e is ConventionEvidence => !!e),
  );
  if (evidence.length === 0) return { ok: false, reason: 'no_evidence' };
  return {
    ok: true,
    rule: {
      rule,
      category: CATEGORIES.includes(c.category as ConventionCategory)
        ? (c.category as ConventionCategory)
        : 'general',
      bad_example: c.bad_example?.trim() || null,
      evidence,
      confidence,
    },
  };
}

/** Drop evidence pointing at the same file+line, cap at MAX_EVIDENCE_PER_RULE. */
function uniqueEvidence(list: ConventionEvidence[]): ConventionEvidence[] {
  const seen = new Set<string>();
  const out: ConventionEvidence[] = [];
  for (const e of list) {
    const key = `${e.path}:${e.line_start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_EVIDENCE_PER_RULE) break;
  }
  return out;
}

// ---- dedupe ----------------------------------------------------------------

/** Comparison key for "the same rule said twice" (within a scan and across scans). */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`'"*_.,;:!()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merge rules the model returned twice (the same rule cited from different
 * files) into one rule with their combined evidence, highest confidence wins.
 * Then drop rules already decided by the user (`decided` keys). Input order is
 * kept for the first occurrence; output is sorted by confidence desc.
 */
export function mergeAndDedupe(
  rules: VerifiedRule[],
  decided: Iterable<string> = [],
): { kept: VerifiedRule[]; dropped: number } {
  const decidedKeys = new Set(decided);
  const byKey = new Map<string, VerifiedRule>();
  let dropped = 0;
  for (const r of rules) {
    const key = ruleKey(r.rule);
    if (decidedKeys.has(key)) {
      dropped += 1;
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...r, evidence: [...r.evidence] });
      continue;
    }
    dropped += 1;
    prev.evidence = uniqueEvidence([...prev.evidence, ...r.evidence]);
    if (r.confidence > prev.confidence) prev.confidence = r.confidence;
    if (!prev.bad_example && r.bad_example) prev.bad_example = r.bad_example;
  }
  const kept = [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
  return { kept, dropped };
}

// ---- skill assembly --------------------------------------------------------

/** Kebab-case slug (matches the SkillName regex), at most `maxLen` chars. */
export function slugify(text: string, maxLen = 64): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLen)
    .replace(/^-+|-+$/g, '');
  return slug || 'repo';
}

/**
 * Default skill name: `<repo>-conventions`, or `<repo>-<category>-conventions`
 * when every selected rule shares one category (one skill per concern).
 */
export function defaultSkillName(repoName: string, categories: ConventionCategory[]): string {
  const unique = [...new Set(categories)];
  const repo = slugify(repoName, 40);
  const middle = unique.length === 1 && unique[0] !== 'general' ? `-${unique[0]}` : '';
  return slugify(`${repo}${middle}-conventions`);
}

export function defaultSkillDescription(repoFullName: string, count: number): string {
  return `${count} house convention${count === 1 ? '' : 's'} extracted from ${repoFullName}`.slice(
    0,
    200,
  );
}

/** Section order and headings in the skill body. */
export const CATEGORY_HEADINGS: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  errors: 'Error handling',
  imports: 'Imports',
  typing: 'Typing',
  testing: 'Testing',
  api: 'API',
  general: 'General',
};

const FENCE_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  json: 'json',
  sql: 'sql',
  css: 'css',
  md: 'md',
};

/** Code-fence language for a path (empty when unknown). */
export function fenceLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return FENCE_LANG[ext] ?? '';
}

function evidenceRef(e: ConventionEvidence): string {
  return e.line_start === e.line_end
    ? `${e.path}:${e.line_start}`
    : `${e.path}:${e.line_start}-${e.line_end}`;
}

/**
 * A code fence longer than any backtick run in `content`, so repo code or a
 * model-written counter-example containing ``` cannot close the block early
 * and spill free text into the reviewer prompt (skills are not wrapUntrusted).
 */
export function codeFence(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** A rule as it goes into the skill body. */
export interface SkillRule {
  rule: string;
  category: ConventionCategory;
  bad_example: string | null;
  evidence: ConventionEvidence[];
}

/**
 * One rule's markdown block: the rule, the first evidence as the ✅ example
 * (other evidence only as references, to save tokens), the ❌ counter-example.
 */
export function ruleBlock(r: SkillRule): string {
  const [first, ...rest] = r.evidence;
  const lines = [`### ${r.rule.trim()}`];
  if (first) {
    const also = rest.length ? ` (also ${rest.map((e) => `\`${evidenceRef(e)}\``).join(', ')})` : '';
    const f = codeFence(first.snippet);
    lines.push(`✅ \`${evidenceRef(first)}\`${also}`, f + fenceLang(first.path), first.snippet, f);
  }
  const bad = r.bad_example?.trim();
  if (bad) {
    const f = codeFence(bad);
    lines.push('❌', f + (first ? fenceLang(first.path) : ''), bad, f);
  }
  return lines.join('\n');
}

/** The whole skill body, rules grouped by category in CATEGORY_HEADINGS order. */
export function buildSkillBody(name: string, repoFullName: string, rules: SkillRule[]): string {
  const sections: string[] = [];
  for (const cat of Object.keys(CATEGORY_HEADINGS) as ConventionCategory[]) {
    const inCat = rules.filter((r) => r.category === cat);
    if (inCat.length === 0) continue;
    sections.push([`## ${CATEGORY_HEADINGS[cat]}`, ...inCat.map(ruleBlock)].join('\n\n'));
  }
  return [
    `# ${name}`,
    '',
    `House conventions for \`${repoFullName}\`. Flag changes that break a rule below and cite the offending \`file:line\`. A rule that does not apply to the diff is not a finding.`,
    '',
    sections.join('\n\n'),
  ].join('\n');
}

/** Distinct evidence paths, for `skills.evidence_files`. */
export function evidenceFiles(rules: { evidence: ConventionEvidence[] }[]): string[] {
  return [...new Set(rules.flatMap((r) => r.evidence.map((e) => e.path)))];
}
