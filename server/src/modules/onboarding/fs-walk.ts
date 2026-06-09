/**
 * A3 — filesystem traversal & IO for the repo analyzer.
 *
 * Best-effort, never-throws helpers that touch disk: the bounded repo walk, the
 * key-file heuristic + excerpting, coverage reading, and tolerant JSON reads.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ANALYZER_MAX_FILES,
  KEY_FILE_EXCERPT_CHARS,
  KEY_FILE_MAX,
  KEY_FILE_NAMES,
  TREE_IGNORE_DIRS,
  TREE_MAX_FILE_BYTES,
} from './constants.js';
import { isRecord } from './helpers.js';

export interface KeyFile {
  path: string;
  excerpt: string;
}

/** Tolerant JSON read — returns null on any error (missing/invalid file). */
export async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Walk the repo collecting relative file paths, bounded by ANALYZER_MAX_FILES. */
export async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const rec = async (dir: string, prefix: string): Promise<void> => {
    if (out.length >= ANALYZER_MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= ANALYZER_MAX_FILES) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (TREE_IGNORE_DIRS.has(e.name)) continue;
        await rec(join(dir, e.name), rel);
      } else if (e.isFile()) {
        const s = await stat(join(dir, e.name)).catch(() => null);
        if (s && s.size < TREE_MAX_FILE_BYTES) out.push(rel);
      }
    }
  };
  await rec(root, '');
  return out;
}

/** Heuristically pick high-signal files and excerpt their heads. */
export async function collectKeyFiles(
  root: string,
  relFiles: string[],
  rootPkg: Record<string, unknown>,
): Promise<KeyFile[]> {
  const candidates = new Set<string>();

  // 1. named high-signal files (README, configs, etc.)
  for (const rel of relFiles) {
    const base = (rel.split('/').pop() ?? '').toLowerCase();
    if (KEY_FILE_NAMES.has(base)) candidates.add(rel);
  }
  // 2. entry points from package.json fields + script targets
  for (const v of [rootPkg.main, rootPkg.module]) {
    if (typeof v === 'string') candidates.add(v.replace(/^\.\//, ''));
  }
  if (typeof rootPkg.bin === 'string') candidates.add(rootPkg.bin.replace(/^\.\//, ''));
  if (isRecord(rootPkg.scripts)) {
    for (const cmd of Object.values(rootPkg.scripts)) {
      const m = typeof cmd === 'string' ? cmd.match(/([\w./-]+\.[tj]sx?)/) : null;
      if (m?.[1] && relFiles.includes(m[1])) candidates.add(m[1]);
    }
  }
  // 3. framework entry conventions
  const ENTRY_RE =
    /(^|\/)(src\/)?(index|main|app|server)\.[tj]sx?$|(^|\/)app\/layout\.[tj]sx?$/;
  for (const rel of relFiles) {
    if (ENTRY_RE.test(rel)) candidates.add(rel);
  }

  // rank: shallower paths first, README/package.json ahead of the rest
  const ranked = [...candidates].sort((a, b) => {
    const score = (p: string) => {
      const base = (p.split('/').pop() ?? '').toLowerCase();
      let s = p.split('/').length; // shallower = better
      if (base === 'readme.md') s -= 10;
      if (base === 'package.json') s -= 5;
      return s;
    };
    return score(a) - score(b);
  });

  const out: KeyFile[] = [];
  for (const rel of ranked.slice(0, KEY_FILE_MAX)) {
    const content = await readFile(join(root, rel), 'utf8').catch(() => '');
    if (!content) continue;
    out.push({ path: rel, excerpt: content.slice(0, KEY_FILE_EXCERPT_CHARS) });
  }
  return out;
}

/** Read line coverage % from coverage/coverage-summary.json, or null. */
export async function readCoverage(root: string): Promise<number | null> {
  const summary = await readJson(join(root, 'coverage', 'coverage-summary.json'));
  const pct = (summary?.total as { lines?: { pct?: unknown } } | undefined)?.lines?.pct;
  return typeof pct === 'number' ? pct : null;
}
