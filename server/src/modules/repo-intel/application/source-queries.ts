/**
 * Diff-scoped reads that parse the clone on demand (T1.3): callers of the
 * changed symbols with their signatures (prompt fuel) and unresolved
 * invocation heads (Phantom-API gate fuel). Both degrade to `[]` — flag off,
 * missing clone, empty input — and never throw on a per-file parse error.
 */
import { extname } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { MAX_CALLERS_PER_SYMBOL, SUPPORTED_EXT } from '../constants.js';
import type { InvocationHead, SourceSymbol } from '../domain/model.js';
import { phantomHeads } from '../domain/rules.js';
import type { RefRow, SignatureRow } from '../types.js';
import type { QueryDeps } from './ports.js';

/**
 * For each callable symbol declared in a changed file, find cross-file callers
 * via the ripgrep CodeIndex, label each with its enclosing symbol + signature,
 * then enrich with the caller file's rank percentile (most important first).
 * At most `limit` rows, deduped by (file, symbol, viaSymbol).
 */
export async function getCallerSignatures(
  deps: QueryDeps,
  repoId: string,
  changedFiles: string[],
  limit: number = MAX_CALLERS_PER_SYMBOL,
): Promise<SignatureRow[]> {
  if (!deps.enabled || changedFiles.length === 0) return [];
  const repo = await deps.reader.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) return [];
  const root = repo.clonePath;
  const symbolsOf = async (file: string): Promise<SourceSymbol[] | null> => {
    if (!deps.analyzer.supports(file)) return null;
    const source = await readOrNull(deps, root, file);
    if (source == null) return null;
    try {
      return deps.analyzer.symbols(file, source);
    } catch {
      return null; // unparseable file — diff-scoped, never throw
    }
  };

  // 1. Callable symbols (function / method / class) declared in changed files.
  //    Only the bare name of a dual-emitted `Class.method` (the qualified form
  //    would double-count callers).
  const declared = new Map<string, { file: string }>();
  for (const file of changedFiles) {
    for (const s of (await symbolsOf(file)) ?? []) {
      if (s.kind !== 'function' && s.kind !== 'method' && s.kind !== 'class') continue;
      if (s.name.includes('.')) continue;
      if (!declared.has(s.name)) declared.set(s.name, { file });
    }
  }
  if (declared.size === 0) return [];

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const out: SignatureRow[] = [];
  const seen = new Set<string>();
  // Caller-file parses are cached across symbols.
  const callerSymbols = new Map<string, SourceSymbol[]>();

  for (const [symbolName, decl] of declared) {
    if (out.length >= limit) break;
    let refs;
    try {
      refs = await deps.codeIndex.references(ref, symbolName);
    } catch {
      continue;
    }
    for (const r of refs) {
      if (out.length >= limit) break;
      if (r.fromPath === decl.file) continue; // skip self-references

      let syms = callerSymbols.get(r.fromPath);
      if (syms === undefined) {
        syms = (await symbolsOf(r.fromPath)) ?? [];
        callerSymbols.set(r.fromPath, syms);
      }
      // Enclosing top-level symbol: largest line ≤ ref.line, no qualified names.
      const enclosing = syms
        .filter((s) => s.line <= r.line && !s.name.includes('.'))
        .sort((a, b) => b.line - a.line)[0];
      if (!enclosing?.signature) continue;

      const key = `${r.fromPath}|${enclosing.name}|${symbolName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file: r.fromPath, symbol: enclosing.name, signature: enclosing.signature, rank: 0 });
    }
  }

  // T3: rank enrichment — a no-op when no index exists yet.
  if (out.length > 0) {
    const ranks = await deps.reader.getFileRankFor(repoId, [...new Set(out.map((o) => o.file))]);
    if (ranks.length > 0) {
      const byFile = new Map(ranks.map((r) => [r.path, r.percentile]));
      for (const o of out) o.rank = byFile.get(o.file) ?? 0;
      out.sort((a, b) => b.rank - a.rank);
    }
  }
  return out;
}

/**
 * Per changed file: bare invocation heads that are neither declared nor
 * imported in that file nor a known runtime global. `declFile` is `null`
 * (ephemeral, diff-scoped check).
 */
export async function getUnresolvedReferences(
  deps: QueryDeps,
  repoId: string,
  files: string[],
): Promise<RefRow[]> {
  if (!deps.enabled || files.length === 0) return [];
  const repo = await deps.reader.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) return [];

  const out: RefRow[] = [];
  for (const file of files) {
    if (!(SUPPORTED_EXT as readonly string[]).includes(extname(file).toLowerCase())) continue;
    const source = await readOrNull(deps, repo.clonePath, file);
    if (source == null) continue;

    let known: Set<string>;
    let heads: InvocationHead[];
    try {
      // `symbols` emits both `Class.method` and bare `method`, so a method
      // declared anywhere in the file resolves as a bare invocation.
      known = new Set([
        ...deps.analyzer.symbols(file, source).map((s) => s.name),
        ...deps.analyzer.importedNames(file, source),
      ]);
      heads = deps.analyzer.invocationHeads(file, source);
    } catch {
      continue; // a binding-level parse failure = "no phantoms here" (conservative)
    }
    for (const head of phantomHeads(heads, known)) {
      out.push({ refFile: file, refLine: head.line, symbolName: head.name, declFile: null });
    }
  }
  return out;
}

async function readOrNull(deps: QueryDeps, root: string, file: string): Promise<string | null> {
  return deps.files.read(root, file).catch(() => null);
}
