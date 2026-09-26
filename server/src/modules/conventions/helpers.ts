import { resolve, sep, extname } from 'node:path';
import type { ConventionCandidate, ConventionScan, Provider, Skill } from '@devdigest/shared';

/**
 * Conventions module — pure helpers. DB row <-> DTO mapping, evidence
 * verification (C3, given already-read file content — no I/O here), rule
 * normalization (C6), and the default skill body template (C7).
 *
 * Row shapes are declared structurally here (not imported from
 * `./repository.js`), the same reason `skills/helpers.ts` does it: an
 * import back from `repository.ts` would form a cycle `arch:check`'s
 * `no-circular` rule catches on a new module (server/INSIGHTS.md, 2026-09-22).
 */

// ---------------------------------------------------------------- Config files

/**
 * Directories never walked when looking for config files. Duplicated from
 * `repo-intel/constants.ts` (`EXCLUDED_DIRS`) rather than imported — a direct
 * cross-module import is `arch:check`'s `no-cross-module-imports` (a module
 * reaches another only through the container or `@devdigest/shared`), and this
 * list is small enough that keeping it in sync by hand is cheap.
 */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

const CONFIG_FILE_PATTERNS: RegExp[] = [
  /^\.eslintrc(\.[a-z0-9]+)?$/i,
  /^eslint\.config\.[a-z0-9]+$/i,
  /^tsconfig[.\w-]*\.json$/i,
  /^\.prettierrc(\.[a-z0-9]+)?$/i,
  /^prettier\.config\.[a-z0-9]+$/i,
  /^\.editorconfig$/i,
];

/** C1 — true when a bare file NAME (no directory) matches a recognised config file pattern. */
export function isConfigFileName(name: string): boolean {
  return CONFIG_FILE_PATTERNS.some((re) => re.test(name));
}

// ---------------------------------------------------------------- Prompt budget

export const MAX_SAMPLE_FILE_LINES = 400;
export const MAX_SAMPLE_FILE_BYTES = 16 * 1024;
export const MAX_PROMPT_BYTES = 60 * 1024;

export interface SampleFile {
  path: string;
  content: string;
}

/** C1 — cap a single file's content to ~400 lines / ~16KB, whichever is smaller. */
export function truncateSampleFile(content: string): string {
  const lines = content.split('\n').slice(0, MAX_SAMPLE_FILE_LINES);
  let out = lines.join('\n');
  if (Buffer.byteLength(out, 'utf8') > MAX_SAMPLE_FILE_BYTES) {
    // Byte-cap without splitting a multi-byte codepoint.
    out = Buffer.from(out, 'utf8').subarray(0, MAX_SAMPLE_FILE_BYTES).toString('utf8');
  }
  return out;
}

/**
 * C1 — per-file truncate, then drop TRAILING files until the whole set fits
 * `MAX_PROMPT_BYTES`. The returned list is exactly what the model sees, and
 * therefore exactly the whitelist `verifyEvidence` checks candidates against
 * (a hallucinated line beyond what was shown is never verifiable).
 */
export function capSamplesForPrompt(files: SampleFile[]): SampleFile[] {
  const capped = files.map((f) => ({ path: f.path, content: truncateSampleFile(f.content) }));
  const out: SampleFile[] = [];
  let total = 0;
  for (const f of capped) {
    const size = Buffer.byteLength(f.content, 'utf8');
    if (out.length > 0 && total + size > MAX_PROMPT_BYTES) break;
    out.push(f);
    total += size;
  }
  return out;
}

// ---------------------------------------------------------------- Evidence (C3)

export interface EvidenceInput {
  path: string;
  start_line: number;
  end_line: number;
}

export interface VerifiedEvidence {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

const MAX_EVIDENCE_SPAN = 30;

/**
 * C3 — verify a candidate's evidence against what the model actually saw.
 * `fileContent` is the SAME (already-capped) text that went into the prompt
 * for this path, read by the caller — this function does no I/O and never
 * trusts the model's own snippet text, only its own read of `fileContent`.
 * Returns null (drop the candidate) on any failed check.
 */
export function verifyEvidence(
  evidence: EvidenceInput,
  opts: { sampledPaths: readonly string[]; clonePath: string; fileContent: string | null },
): VerifiedEvidence | null {
  if (!opts.sampledPaths.includes(evidence.path)) return null;
  if (!isWithinClone(opts.clonePath, evidence.path)) return null;
  if (opts.fileContent == null) return null;

  const lines = opts.fileContent.split('\n');
  const { start_line: start, end_line: end } = evidence;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 1 || end < start || end > lines.length) return null;
  if (end - start + 1 > MAX_EVIDENCE_SPAN) return null;

  const snippetLines = lines.slice(start - 1, end);
  if (snippetLines.every((l) => l.trim() === '')) return null;

  return { path: evidence.path, startLine: start, endLine: end, snippet: snippetLines.join('\n') };
}

/** No path traversal: the resolved path must stay inside `clonePath`. */
function isWithinClone(clonePath: string, relPath: string): boolean {
  const root = resolve(clonePath);
  const target = resolve(root, relPath);
  return target === root || target.startsWith(root + sep);
}

// ---------------------------------------------------------------- Rule normalization (C6)

/** Lowercase, strip punctuation, collapse whitespace — for re-scan de-duplication. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- Skill body (C7)

const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.css': 'css',
  '.md': 'md',
};

function langFromPath(path: string): string {
  return LANG_BY_EXT[extname(path).toLowerCase()] ?? '';
}

export interface SkillBodyCandidate {
  category: string | null;
  rule: string;
  evidence_path: string;
  evidence_start_line: number;
  evidence_end_line: number;
  evidence_snippet: string;
}

/** C7 — the default skill body, rendered from accepted candidates in list order. */
export function buildConventionsSkillBody(
  name: string,
  repoFullName: string,
  candidates: SkillBodyCandidate[],
): string {
  const sections = candidates.map((c) => {
    const category = c.category ?? 'Convention';
    const lang = langFromPath(c.evidence_path);
    return [
      `## ${category}: ${c.rule}`,
      `Detected in \`${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line}\`:`,
      '```' + lang,
      c.evidence_snippet,
      '```',
    ].join('\n');
  });
  return [
    `# ${name}`,
    `House conventions for \`${repoFullName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join('\n\n');
}

// ---------------------------------------------------------------- DTO mapping

interface ConventionRowLike {
  id: string;
  category: string | null;
  rule: string;
  evidencePath: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: string;
}

export function toConventionCandidateDto(row: ConventionRowLike): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine ?? 0,
    evidence_end_line: row.evidenceEndLine ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionCandidate['status'],
  };
}

interface ConventionScanRowLike {
  id: string;
  sha: string;
  model: string;
  provider: string;
  status: string;
  sampleFiles: unknown;
  candidatesFound: number;
  candidatesDropped: number;
  error: string | null;
  createdAt: Date;
}

export function toConventionScanDto(row: ConventionScanRowLike): ConventionScan {
  return {
    id: row.id,
    sha: row.sha,
    model: row.model,
    provider: row.provider as Provider,
    status: row.status as ConventionScan['status'],
    sample_files: Array.isArray(row.sampleFiles) ? (row.sampleFiles as string[]) : [],
    candidates_found: row.candidatesFound,
    candidates_dropped: row.candidatesDropped,
    error: row.error,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------- Skill DTO (C7/C8)

/**
 * Mirrors `skills/helpers.ts`'s `toSkillDto` (same `Skill` contract, same
 * mapping) — duplicated rather than imported, since importing it would be a
 * cross-module edge (`arch:check`'s `no-cross-module-imports`). This module
 * writes skills through `container.skillsRepo` (the sanctioned
 * repository-level door between modules), so it needs its own copy of the
 * row->DTO mapping.
 */
interface SkillRowLike {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

export function toSkillDto(row: SkillRowLike): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? undefined,
  };
}
