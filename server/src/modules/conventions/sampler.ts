/**
 * Sample selection — the step that picks WHAT the model reads, entirely in code.
 *
 * No model call happens here, and that is the point: which files represent a
 * repository's style is a ranking question the index already answers
 * (`repoIntel.getConventionSamples`, PageRank minus tests/configs/migrations),
 * and asking a model to choose its own reading list costs a call to learn
 * nothing the graph did not already know.
 *
 * Two kinds of sample, joined into one reading list:
 *   - **declared tooling** — eslint / tsconfig / prettier / package.json, from
 *     the clone root and each first-level package. A rule that matches a lint
 *     setting is a convention with evidence outside the code.
 *   - **code** — the top-ranked files, head-truncated and line-numbered so the
 *     model can cite a line instead of guessing one.
 *
 * I/O is limited to reading files under the clone path.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import {
  CONFIG_FILE_PATTERNS,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_DIRS,
  MAX_CONFIG_FILES,
  MAX_SAMPLE_LINES,
  MIN_SAMPLE_LINES,
  PACKAGE_MARKER,
  SAMPLE_FILE_COUNT,
  SAMPLE_TOKEN_BUDGET,
} from './constants.js';

export interface SampleFile {
  /** Repo-relative, posix-style — the same path space as `sample_files`. */
  path: string;
  /** Text as the model will see it (already truncated). */
  text: string;
  /** How many lines of the original file `text` covers, starting at line 1. */
  lines: number;
  truncated: boolean;
}

export interface SampleSet {
  configs: SampleFile[];
  code: SampleFile[];
  /** Every path the model was shown — the verifier's allowlist. */
  sampleFiles: string[];
  tokens: number;
}

/** Case-insensitive match of a file name against the config patterns. */
export function isConfigFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return CONFIG_FILE_PATTERNS.some((pattern) => {
    const p = pattern.toLowerCase();
    if (!p.includes('*')) return lower === p;
    const [head, tail] = p.split('*', 2);
    return lower.startsWith(head!) && lower.endsWith(tail ?? '');
  });
}

/** Prefix every line with its 1-based number, right-aligned to the widest one. */
export function numberLines(text: string, startLine = 1): string {
  const lines = text.split('\n');
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(width, ' ')} | ${line}`)
    .join('\n');
}

/** Keep the head of a file: style is declared at the top (imports, exports, setup). */
export function headOfFile(text: string, maxLines: number): { text: string; lines: number; truncated: boolean } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { text, lines: lines.length, truncated: false };
  }
  return { text: lines.slice(0, maxLines).join('\n'), lines: maxLines, truncated: true };
}

interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * `readdir` with a shape of our own. The `withFileTypes` overload resolves to
 * `Dirent<NonSharedBuffer>` under this @types/node, so naming that type in a
 * signature is a compile error waiting for the next bump; this keeps the
 * awkwardness in one function.
 */
async function listDir(path: string): Promise<DirEntry[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: String(e.name),
      isFile: e.isFile(),
      isDirectory: e.isDirectory(),
    }));
  } catch {
    return [];
  }
}

async function readIfFile(path: string, maxBytes?: number): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    const text = await readFile(path, 'utf8');
    return maxBytes != null && text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } catch {
    return null;
  }
}

/**
 * Directories to look for configs in: the clone root, plus every first-level
 * directory carrying a `package.json`.
 *
 * The root-only shortcut would find nothing in this very repository — four
 * packages, an empty root — which is exactly the case a "read the eslint
 * config" step exists for.
 */
export async function configDirs(clonePath: string): Promise<string[]> {
  const dirs = [''];
  for (const entry of await listDir(clonePath)) {
    if (dirs.length >= MAX_CONFIG_DIRS) break;
    if (!entry.isDirectory) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const marker = await readIfFile(join(clonePath, entry.name, PACKAGE_MARKER), 1);
    if (marker != null) dirs.push(entry.name);
  }
  return dirs;
}

/** Read the config files of every sampled directory, newest-shallowest first. */
export async function collectConfigs(clonePath: string): Promise<SampleFile[]> {
  const out: SampleFile[] = [];
  for (const dir of await configDirs(clonePath)) {
    for (const entry of await listDir(join(clonePath, dir))) {
      if (out.length >= MAX_CONFIG_FILES) return out;
      if (!entry.isFile || !isConfigFileName(entry.name)) continue;
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      const text = await readIfFile(join(clonePath, rel), MAX_CONFIG_BYTES);
      if (text == null || text.trim() === '') continue;
      const head = headOfFile(text, MAX_SAMPLE_LINES);
      out.push({ path: rel, text: head.text, lines: head.lines, truncated: head.truncated });
    }
  }
  return out;
}

/**
 * Choose `count` files from the pool: substantial ones first, in pool order,
 * then — only if the pool runs short — the small ones, also in pool order.
 *
 * Pool order is the facade's interleave (fair across packages, rank inside
 * each), so taking a prefix of the substantial files keeps that balance.
 */
export function pickSubstantial(files: SampleFile[], count: number, minLines: number): SampleFile[] {
  const substantial = files.filter((f) => f.lines >= minLines);
  if (substantial.length >= count) return substantial.slice(0, count);
  const small = files.filter((f) => f.lines < minLines);
  return [...substantial, ...small.slice(0, count - substantial.length)];
}

/**
 * Read the pool of ranked code files, keep the best `maxFiles` of them, and drop
 * from the END of the reading list until the whole sample fits the budget.
 *
 * `rankedFiles` arrives in the facade's interleaved order, so trimming from the
 * end sheds the least-needed file of the most over-represented part. Configs
 * are never dropped: they are small, and a declared rule is the
 * highest-confidence evidence a scan can carry.
 */
export async function collectSamples(opts: {
  clonePath: string;
  rankedFiles: string[];
  tokenizer: Tokenizer;
  maxFiles?: number;
  minLines?: number;
}): Promise<SampleSet> {
  const configs = await collectConfigs(opts.clonePath);

  const pool: SampleFile[] = [];
  for (const rel of opts.rankedFiles) {
    const text = await readIfFile(join(opts.clonePath, rel));
    if (text == null || text.trim() === '') continue;
    const head = headOfFile(text, MAX_SAMPLE_LINES);
    pool.push({ path: rel, text: head.text, lines: head.lines, truncated: head.truncated });
  }
  const code = pickSubstantial(
    pool,
    opts.maxFiles ?? SAMPLE_FILE_COUNT,
    opts.minLines ?? MIN_SAMPLE_LINES,
  );

  const cost = (f: SampleFile) => opts.tokenizer.count(f.text);
  let tokens = configs.reduce((sum, f) => sum + cost(f), 0) + code.reduce((sum, f) => sum + cost(f), 0);
  while (code.length > 1 && tokens > SAMPLE_TOKEN_BUDGET) {
    tokens -= cost(code[code.length - 1]!);
    code.pop();
  }

  return {
    configs,
    code,
    sampleFiles: [...configs, ...code].map((f) => f.path),
    tokens,
  };
}

/** Render the sample set as the two user-message sections the prompt expects. */
export function renderSamples(set: SampleSet): string {
  const parts: string[] = [];

  if (set.configs.length > 0) {
    const blocks = set.configs
      .map((f) => `### ${f.path}\n\`\`\`\n${f.text}\n\`\`\``)
      .join('\n\n');
    parts.push(`## Declared tooling\n<untrusted source="repo">\n${blocks}\n</untrusted>`);
  }

  const blocks = set.code
    .map(
      (f) =>
        `### ${f.path}${f.truncated ? ` (first ${f.lines} lines)` : ''}\n\`\`\`\n${numberLines(f.text)}\n\`\`\``,
    )
    .join('\n\n');
  parts.push(`## Sample files\n<untrusted source="repo">\n${blocks}\n</untrusted>`);

  return parts.join('\n\n');
}

/**
 * The "do not propose these again" section.
 *
 * This is what makes a re-scan worth running: without it the model re-proposes
 * the rules the user already judged, and the second scan is a slower copy of
 * the first.
 */
export function renderAlreadyDecided(accepted: string[], rejected: string[]): string {
  if (accepted.length === 0 && rejected.length === 0) return '';
  const lines: string[] = ['## Already decided'];
  if (accepted.length > 0) {
    lines.push('Accepted previously — do NOT propose these again:');
    lines.push(...accepted.map((r) => `- ${r}`));
  }
  if (rejected.length > 0) {
    lines.push('Rejected previously — do NOT propose these or close variants:');
    lines.push(...rejected.map((r) => `- ${r}`));
  }
  return lines.join('\n');
}
