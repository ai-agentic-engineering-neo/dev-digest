/**
 * Sample selection and rendering — pure code, no model (spec: Pipeline §1).
 */
import {
  CONFIG_BASENAMES,
  CONFIG_FILE_MAX_CHARS,
  CONFIG_MAX_FILES,
  CONFIG_PREFIXES,
  SAMPLE_TOP_N,
  SAMPLE_TOTAL_MAX_CHARS,
  SOURCE_EXTENSIONS,
  SOURCE_FILE_MAX_CHARS,
} from './constants.js';

export type SampleKind = 'config' | 'source';

export interface SampledFile {
  path: string;
  kind: SampleKind;
  content: string;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depth(path: string): number {
  return path.split('/').length - 1;
}

/** A config file / rule doc worth sampling (root or depth 1 only). */
export function isConfigFile(path: string): boolean {
  if (depth(path) > 1) return false;
  const name = basename(path);
  if ((CONFIG_BASENAMES as readonly string[]).includes(name)) return true;
  return CONFIG_PREFIXES.some((p) => name.startsWith(p));
}

/** Root configs first, then depth-1 ones; stable by path; capped. */
export function pickConfigFiles(paths: readonly string[]): string[] {
  return paths
    .filter(isConfigFile)
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, CONFIG_MAX_FILES);
}

const TEST_RE = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/;
const GENERATED_RE = /\.(min|d|generated)\.[a-z]+$|(^|\/)generated\//;
/** Tool configs (`vitest.config.ts`, `next.config.mjs`) are boilerplate, not house code. */
const TOOL_CONFIG_RE = /(^|\/)[^/]+\.config\.[a-z]+$/;

export function isSourceFile(path: string): boolean {
  if (TEST_RE.test(path) || GENERATED_RE.test(path) || TOOL_CONFIG_RE.test(path)) return false;
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Fallback when repo-intel has no ranking: source files spread across
 * directories (round-robin over dirs, shallow dirs first), so one big folder
 * does not fill the whole sample.
 */
export function pickFallbackSources(paths: readonly string[], n = SAMPLE_TOP_N): string[] {
  const byDir = new Map<string, string[]>();
  for (const p of paths.filter(isSourceFile).sort()) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const list = byDir.get(dir) ?? [];
    list.push(p);
    byDir.set(dir, list);
  }
  const dirs = [...byDir.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  const out: string[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const dir of dirs) {
      const file = byDir.get(dir)![round];
      if (!file) continue;
      out.push(file);
      added = true;
      if (out.length >= n) break;
    }
    if (!added) break;
  }
  return out;
}

/** Prefix every line with its 1-based number (`  12| code`), truncated to `maxChars`. */
export function numberLines(content: string, maxChars: number): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const width = String(lines.length).length;
  const out: string[] = [];
  let size = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = `${String(i + 1).padStart(width)}| ${lines[i]}`;
    if (size + line.length + 1 > maxChars) {
      out.push(`… (truncated, ${lines.length - i} more lines)`);
      break;
    }
    out.push(line);
    size += line.length + 1;
  }
  return out.join('\n');
}

/**
 * Render the sample for the prompt: one `=== FILE: <path> (<kind>) ===` block per
 * file with numbered lines, within the per-file and total budgets. Returns the
 * text and the paths that actually made it in.
 */
export function renderSample(files: readonly SampledFile[]): { text: string; included: string[] } {
  const blocks: string[] = [];
  const included: string[] = [];
  let total = 0;
  for (const f of files) {
    const cap = f.kind === 'config' ? CONFIG_FILE_MAX_CHARS : SOURCE_FILE_MAX_CHARS;
    const block = `=== FILE: ${f.path} (${f.kind}) ===\n${numberLines(f.content, cap)}`;
    if (total + block.length > SAMPLE_TOTAL_MAX_CHARS) break;
    blocks.push(block);
    included.push(f.path);
    total += block.length;
  }
  return { text: blocks.join('\n\n'), included };
}
