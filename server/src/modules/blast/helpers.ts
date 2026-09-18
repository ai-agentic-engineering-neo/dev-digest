/**
 * Maps `repoIntel.getBlastRadius()`'s internal `BlastResult` (flat callers +
 * file-keyed facts) onto the public `BlastRadius` wire contract (one
 * `DownstreamImpact` per changed symbol). This is the only file that knows
 * about both shapes — everything else in this module only ever sees one side
 * of it.
 */
import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

export function toBlastRadius(result: BlastResult): BlastRadius {
  const callersBySymbol = new Map<string, BlastResult['callers']>();
  for (const c of result.callers) {
    const arr = callersBySymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else callersBySymbol.set(c.viaSymbol, [c]);
  }

  // One entry per changed symbol, including symbols with zero callers, so
  // `changed_symbols.length === downstream.length` and the client can render
  // one tree row per changed symbol regardless of impact.
  const downstream: DownstreamImpact[] = result.changedSymbols.map((sym) => {
    const callers = callersBySymbol.get(sym.name) ?? [];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    // Endpoints/crons reached two ways: (a) this symbol's own resolved
    // callers, and (b) the reverse-import graph walked from the symbol's
    // declaring file — a file that only imports (never calls) it can still
    // be the one registering the affected route.
    const attributedFiles = new Set<string>(callers.map((c) => c.file));
    for (const f of result.dependentFilesByChangedFile?.[sym.file] ?? []) attributedFiles.add(f);
    for (const file of attributedFiles) {
      const facts = result.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const cr of facts.crons) crons.add(cr);
    }
    return {
      symbol: sym.name,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  return {
    changed_symbols: result.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
    })),
    downstream,
    summary: buildSummary(result),
  };
}

/**
 * Deterministic one-sentence summary — the `BlastRadius` contract requires
 * `summary: string`, and this task's LLM-authored version is explicitly
 * optional/out of scope (see `blast/README.md`). A degraded/partial index is
 * called out in the sentence itself, since the shared contract carries no
 * `degraded` field of its own — the point is to never mask an incomplete
 * index behind a silently-empty result.
 */
function buildSummary(result: BlastResult): string {
  const symbolCount = result.changedSymbols.length;
  if (symbolCount === 0) {
    return result.degraded
      ? 'Partial index — no changed symbols could be resolved yet.'
      : 'No symbols declared in the changed files.';
  }

  const callerCount = result.callers.length;
  const fileCount = new Set(result.callers.map((c) => c.file)).size;
  const endpointCount = result.impactedEndpoints.length;

  const parts = [
    `${symbolCount} changed symbol${symbolCount === 1 ? '' : 's'}`,
    callerCount > 0
      ? `reach${symbolCount === 1 ? 'es' : ''} ${callerCount} caller${callerCount === 1 ? '' : 's'} across ${fileCount} file${fileCount === 1 ? '' : 's'}`
      : 'have no resolved callers',
  ];
  if (endpointCount > 0) {
    parts.push(`touching ${endpointCount} endpoint${endpointCount === 1 ? '' : 's'}`);
  }

  const sentence = `${parts.join(', ')}.`;
  return result.degraded ? `Partial index — results may be incomplete. ${sentence}` : sentence;
}
