/** Callers-in-prompt use case: signatures of cross-file callers of changed symbols. */
import type { RepoRef } from '@devdigest/shared';
import { parseSymbols, langForFile } from '../../adapters/astgrep/index.js';
import { readClone } from './clone-read.js';
import type { RepoIntelDeps } from './deps.js';
import type { SignatureRow } from './types.js';
import { MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * T1.3 — diff-scoped, best-effort callers-in-prompt fuel.
 *
 * For each symbol declared in a changed file (astgrep parseSymbols), find
 * cross-file callers via the EXISTING ripgrep-backed `codeIndex.
 * references()` (the same path blast already trusts), then label each caller
 * with its enclosing symbol + signature (astgrep parseSymbols of the caller
 * file). rank=0 until T3 wires file_rank.
 *
 * Skips type/interface symbols (no call sites). Returns at most `limit` rows,
 * deduped by (file, symbol, viaSymbol). Degraded gate: flag off, missing
 * clone, or empty input → `[]`.
 */
export async function getCallerSignatures(
  d: Pick<RepoIntelDeps, 'repository' | 'codeIndex' | 'enabled'>,
  repoId: string,
  changedFiles: string[],
  limit: number = MAX_CALLERS_PER_SYMBOL,
): Promise<SignatureRow[]> {
  if (!d.enabled) return [];
  if (changedFiles.length === 0) return [];

  const repo = await d.repository.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) return [];

  // 1. Symbols declared in changed files. Filter to symbols that can BE
  //    called (function / method / class). Type/interface aliases have no
  //    call sites, so chasing references for them just wastes work.
  const declaredSymbols = new Map<string, { file: string; kind: string }>();
  for (const file of changedFiles) {
    if (!langForFile(file)) continue;
    const source = await readClone(repo.clonePath, file);
    if (source == null) continue;
    try {
      for (const s of parseSymbols(file, source)) {
        if (s.kind !== 'function' && s.kind !== 'method' && s.kind !== 'class') continue;
        // Dual-emit (Class.method + method): only store the bare name; the
        // qualified form would double-count callers.
        if (s.name.includes('.')) continue;
        if (!declaredSymbols.has(s.name)) {
          declaredSymbols.set(s.name, { file, kind: s.kind });
        }
      }
    } catch {
      // skip unparseable files — diff-scoped, never throw
    }
  }
  if (declaredSymbols.size === 0) return [];

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const out: SignatureRow[] = [];
  const seen = new Set<string>();
  // Cache caller-file astgrep parses so we don't re-parse the same file per
  // referenced symbol.
  const callerSymbolsByFile = new Map<string, ReturnType<typeof parseSymbols>>();

  for (const [symbolName, decl] of declaredSymbols) {
    if (out.length >= limit) break;
    let refs;
    try {
      refs = await d.codeIndex.references(ref, symbolName);
    } catch {
      continue;
    }
    for (const r of refs) {
      if (out.length >= limit) break;
      if (r.fromPath === decl.file) continue; // skip self-references

      // Parse the caller file once; reuse for further symbols in this loop.
      let callerSyms = callerSymbolsByFile.get(r.fromPath);
      if (callerSyms === undefined) {
        if (!langForFile(r.fromPath)) {
          callerSymbolsByFile.set(r.fromPath, []);
          callerSyms = [];
        } else {
          const callerSrc = await readClone(repo.clonePath, r.fromPath);
          if (callerSrc == null) {
            callerSymbolsByFile.set(r.fromPath, []);
            callerSyms = [];
          } else {
            try {
              callerSyms = parseSymbols(r.fromPath, callerSrc);
            } catch {
              callerSyms = [];
            }
            callerSymbolsByFile.set(r.fromPath, callerSyms);
          }
        }
      }

      // Pick the enclosing top-level symbol (largest line ≤ ref.line, no
      // qualified names — match blast/helpers.ts callerName behavior).
      const enclosing = (callerSyms ?? [])
        .filter((s) => s.line <= r.line && !s.name.includes('.'))
        .sort((a, b) => b.line - a.line)[0];
      if (!enclosing) continue; // no enclosing symbol → no signature to emit
      const signature = enclosing.signature;
      if (!signature) continue;

      const dedupKey = `${r.fromPath}|${enclosing.name}|${symbolName}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      out.push({
        file: r.fromPath,
        symbol: enclosing.name,
        signature,
        rank: 0, // enriched from file_rank below (T3)
      });
    }
  }

  // T3: enrich each caller with its file's rank percentile so the prompt can
  // lead with the most important callers. No-op when no index exists yet.
  if (out.length > 0) {
    const files = [...new Set(out.map((o) => o.file))];
    const ranks = await d.repository.getFileRankFor(repoId, files);
    if (ranks.length > 0) {
      const byFile = new Map(ranks.map((r) => [r.path, r.percentile]));
      for (const o of out) o.rank = byFile.get(o.file) ?? 0;
      out.sort((a, b) => b.rank - a.rank);
    }
  }

  return out;
}
