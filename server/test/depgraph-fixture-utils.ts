/**
 * Shared helpers for the dependency-graph fixture gate and the non-gating
 * measurement report (plan 19 / P1-F). In-memory, no DB. Not a test file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { MODULE_SYMBOL, parseModuleFacts } from '../src/adapters/astgrep/module-facts.js';
import type { ModuleSymbol } from '../src/adapters/astgrep/module-facts.js';
import { TsModuleResolverFactory } from '../src/adapters/tsresolve/index.js';
import type { ModuleResolverInstance } from '../src/domain/ports/module-resolver.js';
import { EXCLUDED_DIRS, MAX_FILE_SIZE, MAX_INDEXED_FILES, SUPPORTED_EXT } from '../src/modules/repo-intel/constants.js';
import type { ParsedModule } from '../src/modules/repo-intel/graph/index.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);
const SUPPORTED = new Set<string>(SUPPORTED_EXT);

export const isCode = (p: string): boolean => SUPPORTED.has(extname(p).toLowerCase());

/** Deterministic walk (sorted, posix, no symlinks, same excluded dirs as the indexer). `skipDirs` are extra top-level names. */
export function walkTree(root: string, skipDirs: readonly string[] = []): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (EXCLUDED.has(e.name) || (dir === root && skipDirs.includes(e.name))) continue;
        visit(full);
      } else if (e.isFile()) {
        out.push(relative(root, full).split(sep).join('/'));
      }
    }
  };
  visit(root);
  return out.sort();
}

export function readTextIn(root: string): (rel: string) => string | null {
  return (rel) => {
    try {
      const full = join(root, rel);
      if (lstatSync(full).isSymbolicLink()) return null;
      return readFileSync(full, 'utf8');
    } catch {
      return null;
    }
  };
}

export function parseFiles(root: string, files: string[]): ParsedModule[] {
  const read = readTextIn(root);
  const out: ParsedModule[] = [];
  for (const path of files) {
    if (!isCode(path)) continue;
    const src = read(path);
    if (src === null) continue;
    out.push({ path, facts: parseModuleFacts(path, src) });
  }
  return out;
}

export function realResolver(root: string, files: Iterable<string>): ModuleResolverInstance {
  return new TsModuleResolverFactory().create({ root, files: new Set(files), readText: readTextIn(root) });
}

// ---- hunks / changed symbols ----------------------------------------------

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK.exec(line);
    if (!m) continue;
    hunks.push({
      oldStart: Number(m[1]),
      oldLines: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newLines: m[4] === undefined ? 1 : Number(m[4]),
    });
  }
  return hunks;
}

interface Range {
  from: number;
  to: number;
}
const oldRange = (h: Hunk): Range | null => (h.oldLines > 0 ? { from: h.oldStart, to: h.oldStart + h.oldLines - 1 } : null);
const newRange = (h: Hunk): Range | null => (h.newLines > 0 ? { from: h.newStart, to: h.newStart + h.newLines - 1 } : null);
const overlaps = (s: ModuleSymbol, r: Range): boolean => s.line <= r.to && s.endLine >= r.from;
const contains = (outer: ModuleSymbol, inner: ModuleSymbol): boolean =>
  outer !== inner && outer.line <= inner.line && outer.endLine >= inner.endLine && (outer.line < inner.line || outer.endLine > inner.endLine);

/** Tightest hunk-intersecting declarations of one side; null when none (=> module scope). */
function leaves(symbols: ModuleSymbol[], range: Range): string[] | null {
  const hit = symbols.filter((s) => s.name !== MODULE_SYMBOL && overlaps(s, range));
  // `Class.m` is emitted twice (qualified + bare, same span): keep the qualified one.
  const dedup = hit.filter(
    (s) => !(s.kind === 'method' && !s.name.includes('.') && hit.some((q) => q !== s && q.name.endsWith(`.${s.name}`) && q.line === s.line)),
  );
  const tight = dedup.filter((s) => !dedup.some((o) => contains(s, o)));
  return tight.length > 0 ? tight.map((s) => s.name) : null;
}

/**
 * v3 "changed symbols" for one file: declarations whose range intersects a
 * hunk (new-side ranges against the head declarations, old-side ranges
 * against the base declarations); a hunk outside every declaration is the
 * module-scope pseudo-symbol.
 */
export function changedSymbols(oldSymbols: ModuleSymbol[], newSymbols: ModuleSymbol[], hunks: Hunk[]): string[] {
  const out = new Set<string>();
  for (const h of hunks) {
    const n = newRange(h);
    if (n) for (const s of leaves(newSymbols, n) ?? [MODULE_SYMBOL]) out.add(s);
    const o = oldRange(h);
    if (o) for (const s of leaves(oldSymbols, o) ?? [MODULE_SYMBOL]) out.add(s);
  }
  return [...out].sort();
}

/** Independent re-check: does a reported symbol really intersect a hunk (module symbol: a hunk outside every declaration)? */
export function intersectsHunk(name: string, oldSymbols: ModuleSymbol[], newSymbols: ModuleSymbol[], hunks: Hunk[]): boolean {
  const ranges: Array<{ side: 'old' | 'new'; r: Range }> = [];
  for (const h of hunks) {
    const o = oldRange(h);
    const n = newRange(h);
    if (o) ranges.push({ side: 'old', r: o });
    if (n) ranges.push({ side: 'new', r: n });
  }
  const pick = (side: 'old' | 'new'): ModuleSymbol[] => (side === 'old' ? oldSymbols : newSymbols);
  if (name === MODULE_SYMBOL) {
    return ranges.some(({ side, r }) => !pick(side).some((s) => s.name !== MODULE_SYMBOL && overlaps(s, r)));
  }
  return ranges.some(({ side, r }) => pick(side).some((s) => s.name === name && overlaps(s, r)));
}

// ---- git helpers for the report -------------------------------------------

export function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Tracked TS/JS files under the indexer's budgets (excluded dirs, size, count). */
export function trackedCodeFiles(root: string): string[] {
  const files = git(root, ['ls-files', '-z'])
    .split('\0')
    .filter((p) => p && isCode(p) && !p.split('/').some((seg) => EXCLUDED.has(seg)))
    .filter((p) => {
      try {
        return existsSync(join(root, p)) && statSync(join(root, p)).size <= MAX_FILE_SIZE;
      } catch {
        return false;
      }
    })
    .sort();
  return files.slice(0, MAX_INDEXED_FILES);
}
