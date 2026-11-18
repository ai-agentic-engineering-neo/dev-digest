/**
 * Shared helpers for the full + incremental pipelines (plan 19 / P1-E):
 * one-read file parsing, contained `readText` for the resolver, and the
 * mapping from parsed facts / graph output to `symbols` + `references` rows.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';
import { parseModuleFacts, type ModuleFacts } from '../../../adapters/astgrep/module-facts.js';
import { extractCrons, extractEndpoints } from '../../../adapters/codeindex/extract.js';
import { withTimeout } from '../../../platform/resilience.js';
import { MAX_PARSE_MS_PER_FILE } from '../constants.js';
import type { ModuleResolverInput } from '../../../domain/ports/module-resolver.js';
import type { ReferenceDecl } from '../graph/index.js';
import type { IndexerReferenceRow, IndexerSymbolRow, RepoIntelRepository } from '../repository.js';

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

export function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ParsedFile {
  facts: ModuleFacts;
  contentHash: string;
  endpoints: string[];
  crons: string[];
}

/**
 * Parse one already-read source under the per-file watchdog (one read per
 * file: callers read once and hand the text here). Throws on timeout/parse
 * failure so the caller records it as `parseDegraded`.
 */
export async function parseSource(relPath: string, source: string): Promise<ParsedFile> {
  const facts = await withTimeout(
    Promise.resolve().then(() => parseModuleFacts(relPath, source)),
    MAX_PARSE_MS_PER_FILE,
  );
  return {
    facts,
    contentHash: sha1(source),
    endpoints: extractEndpoints(source),
    crons: extractCrons(source),
  };
}

/**
 * Contained synchronous reader handed to the resolver (tsconfig discovery).
 * Refuses non-relative / traversal paths and anything whose real path leaves
 * the clone (a symlink planted by the repo must not read host files).
 */
export function makeReadText(root: string): ModuleResolverInput['readText'] {
  let realRoot: string | null = null;
  try {
    realRoot = realpathSync(root);
  } catch {
    realRoot = null;
  }
  return (rel) => {
    if (!realRoot) return null;
    if (rel.length === 0 || rel.includes('\0') || isAbsolute(rel)) return null;
    if (rel.split(/[\\/]/).includes('..')) return null;
    try {
      const full = join(root, rel);
      if (lstatSync(full).isSymbolicLink()) return null;
      const real = realpathSync(full);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
      return readFileSync(real, 'utf8');
    } catch {
      return null;
    }
  };
}

/**
 * `symbols` rows for one file. `Class.method` is the graph key; the bare
 * method row is kept alongside (v1 readers look names up bare) — derived here
 * from the qualified row so the parser stays single-pass.
 */
export function symbolRowsFor(
  repoId: string,
  path: string,
  contentHash: string,
  facts: ModuleFacts,
): IndexerSymbolRow[] {
  const out: IndexerSymbolRow[] = [];
  const seen = new Set<string>();
  const add = (name: string, s: ModuleFacts['symbols'][number]): void => {
    const key = `${name}\0${s.kind}\0${s.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      repoId,
      path,
      name,
      kind: s.kind,
      line: s.line,
      endLine: s.endLine,
      exported: s.exported,
      signature: s.signature,
      contentHash,
    });
  };
  for (const s of facts.symbols) {
    add(s.name, s);
    if (s.kind === 'method' && s.name.includes('.')) add(s.name.slice(s.name.lastIndexOf('.') + 1), s);
  }
  return out;
}

/**
 * `references` rows for one file. `decls` are the graph's per-reference
 * resolutions (null when the graph was skipped/failed): exact/inferred rows
 * carry `decl_file`; external-library references are NOT written (they are not
 * phantoms and not repo symbols); unresolved ones are kept only for bare calls
 * (`foo()`), the population the phantom gate has always judged — so
 * `decl_file IS NULL` means "unresolved", never "external".
 */
export function referenceRowsFor(
  repoId: string,
  path: string,
  contentHash: string,
  facts: ModuleFacts,
  decls: ReferenceDecl[] | null,
): IndexerReferenceRow[] {
  const bareCall = new Set<string>();
  for (const r of facts.references) {
    if (r.kind === 'call' && r.receiver === null) bareCall.add(`${r.name}\0${r.line}`);
  }
  const rows = new Map<string, IndexerReferenceRow>();
  const put = (name: string, line: number, declFile: string | null): void => {
    const key = `${name}\0${line}`;
    const prev = rows.get(key);
    if (prev && (prev.declFile || !declFile)) return; // resolved beats unresolved
    rows.set(key, { repoId, fromPath: path, toSymbol: name, line, declFile, contentHash });
  };
  if (decls === null) {
    for (const k of bareCall) {
      const [name, line] = k.split('\0');
      put(name!, Number(line), null);
    }
  } else {
    for (const d of decls) {
      if (d.via === 'exact' || d.via === 'inferred') put(d.name, d.line, d.declFile);
      else if (d.via === 'unresolved' && bareCall.has(`${d.name}\0${d.line}`)) put(d.name, d.line, null);
    }
  }
  return [...rows.values()];
}

/** Best-effort `reindex_state='running'` progress write; never throws (AC-16). */
export async function reportProgress(
  repository: RepoIntelRepository,
  repoId: string,
  done: number,
  total: number,
): Promise<void> {
  try {
    await repository.setReindexProgress(repoId, 'running', done, total);
  } catch {
    // progress is observability only
  }
}
