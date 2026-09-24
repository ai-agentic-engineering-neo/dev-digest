/**
 * Use case — blast radius of a set of changed files: the symbols they declare,
 * the cross-file callers of those symbols, and the HTTP endpoints reachable
 * from the callers.
 *
 * Two paths:
 *   - persistent (T3): symbols / resolved references / file_rank / file_facts
 *     straight from Postgres — no clone parsing on the hot path;
 *   - degraded fallback: the ripgrep CodeIndex over the clone, re-reading the
 *     caller files for endpoints. Always tagged `degraded: true`.
 */
import type { CodeSymbol, RepoRef } from '@devdigest/shared';
import { MAX_CALLERS_PER_SYMBOL } from '../constants.js';
import type { FullSymbolRow } from '../domain/model.js';
import { enclosingFromRows, enclosingSymbolName } from '../domain/rules.js';
import type { BlastCallerRow, BlastChangedSymbol, BlastResult } from '../types.js';
import type { QueryDeps } from './ports.js';

const EMPTY_DEGRADED: Readonly<BlastResult> = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: true,
  reason: 'no_data',
};

export async function getBlastRadius(
  deps: QueryDeps,
  repoId: string,
  changedFiles: string[],
): Promise<BlastResult> {
  if (deps.enabled && changedFiles.length > 0) {
    const persistent = await persistentBlast(deps, repoId, changedFiles);
    if (persistent) return persistent;
  }
  return degradedBlast(deps, repoId, changedFiles);
}

/**
 * Persistent-index blast. Returns `null` when the index isn't usable (caller
 * falls back to ripgrep). Callers are PRECISE: only references whose
 * `decl_file` resolved to a changed file count — an ambiguous (NULL decl_file)
 * reference is not asserted as a caller.
 */
async function persistentBlast(
  deps: QueryDeps,
  repoId: string,
  changedFiles: string[],
): Promise<BlastResult | null> {
  const { reader } = deps;
  const state = await reader.tryGetIndexState(repoId);
  if (!state || (state.status !== 'full' && state.status !== 'partial')) return null;

  // Changed symbols = declared in a changed file. Skip the qualified
  // `Class.method` dual-emit (the bare form already covers the name).
  const declRows = await reader.getSymbolRows(repoId, changedFiles);
  const changedSymbols: BlastChangedSymbol[] = [];
  const nameSet = new Set<string>();
  const seenSym = new Set<string>();
  for (const s of declRows) {
    if (s.name.includes('.')) continue;
    const key = `${s.name}:${s.path}`;
    if (!seenSym.has(key)) {
      seenSym.add(key);
      changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
    }
    nameSet.add(s.name);
  }
  if (nameSet.size === 0) {
    return { changedSymbols, callers: [], impactedEndpoints: [], degraded: false };
  }

  const callerRows = await reader.getResolvedCallers(repoId, changedFiles, [...nameSet]);
  const callerFiles = [...new Set(callerRows.map((c) => c.fromPath))];

  // Enclosing caller symbol from the callers' persistent symbol rows.
  const symsByFile = new Map<string, FullSymbolRow[]>();
  for (const s of await reader.getSymbolRows(repoId, callerFiles)) {
    const arr = symsByFile.get(s.path);
    if (arr) arr.push(s);
    else symsByFile.set(s.path, [s]);
  }

  const callers: BlastCallerRow[] = [];
  const seenCaller = new Set<string>();
  for (const c of callerRows) {
    const enclosing =
      enclosingFromRows(symsByFile.get(c.fromPath) ?? [], c.line) ?? c.fromPath.split('/').pop() ?? c.fromPath;
    const key = `${c.fromPath}|${enclosing}|${c.toSymbol}`;
    if (seenCaller.has(key)) continue;
    seenCaller.add(key);
    callers.push({ file: c.fromPath, symbol: enclosing, viaSymbol: c.toSymbol, line: c.line, rank: c.rank });
  }
  callers.sort((a, b) => b.rank - a.rank);

  // Precomputed facts per caller file, so consumers can attribute endpoints
  // and crons to the changed symbol whose callers live in that file.
  const endpoints = new Set<string>();
  const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
  for (const f of await reader.getFileFacts(repoId, callerFiles)) {
    factsByFile[f.filePath] = { endpoints: f.endpoints, crons: f.crons };
    for (const e of f.endpoints) endpoints.add(e);
  }

  return {
    changedSymbols,
    callers: callers.slice(0, MAX_CALLERS_PER_SYMBOL),
    impactedEndpoints: [...endpoints],
    factsByFile,
    degraded: false,
  };
}

/** Best-effort blast over the ripgrep CodeIndex (no persistent rank: rank 0). */
async function degradedBlast(
  deps: QueryDeps,
  repoId: string,
  changedFiles: string[],
): Promise<BlastResult> {
  const repo = await deps.reader.getRepoBasics(repoId);
  if (!repo || !repo.clonePath || changedFiles.length === 0) return { ...EMPTY_DEGRADED };
  const root = repo.clonePath;
  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const changedSet = new Set(changedFiles);

  let allSymbols: CodeSymbol[];
  try {
    allSymbols = await deps.codeIndex.symbols(ref);
  } catch {
    return { ...EMPTY_DEGRADED };
  }

  // changed symbols = declared in any changed file (dedup by name+file).
  const changedSymbols: BlastChangedSymbol[] = [];
  const seen = new Set<string>();
  for (const s of allSymbols) {
    if (!changedSet.has(s.path)) continue;
    const key = `${s.name}:${s.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
  }

  const callers: BlastCallerRow[] = [];
  const endpoints = new Set<string>();
  const callerSeen = new Set<string>();
  for (const sym of changedSymbols) {
    let refs;
    try {
      refs = await deps.codeIndex.references(ref, sym.name);
    } catch {
      continue;
    }
    const callerFiles = new Set<string>();
    for (const r of refs) {
      if (r.fromPath === sym.file) continue; // skip the decl's own file
      const callerName = enclosingSymbolName(allSymbols, r.fromPath, r.line);
      const key = `${r.fromPath}|${callerName}|${sym.name}`;
      if (callerSeen.has(key)) continue;
      callerSeen.add(key);
      callers.push({ file: r.fromPath, symbol: callerName, viaSymbol: sym.name, line: r.line, rank: 0 });
      callerFiles.add(r.fromPath);
    }
    // HTTP routes reachable from any caller file (best-effort).
    for (const file of callerFiles) {
      const content = await deps.files.read(root, file).catch(() => null);
      if (!content) continue;
      for (const e of deps.analyzer.endpoints(content)) endpoints.add(e);
    }
  }

  return { changedSymbols, callers, impactedEndpoints: [...endpoints], degraded: true, reason: 'no_data' };
}
