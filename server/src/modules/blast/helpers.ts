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
  //
  // endpoints_affected/crons_affected are attributed ONLY from this symbol's
  // own resolved callers' files — deliberately NOT from the wider
  // file-level reverse-import BFS (`dependentFilesByChangedFile`). That BFS
  // answers a real but file-scoped question ("what does the changed FILE
  // reach two import-hops out?"), not a per-symbol one: in a composition-root
  // architecture (a DI container importing every service, itself imported by
  // the app bootstrap that declares health-check routes inline) almost any
  // file ends up "2 hops from /health", which would tag every symbol in a
  // busy file with the same unrelated endpoints — precise-looking but
  // meaningless. The file-level reach still isn't discarded: it feeds
  // `BlastResult.impactedEndpoints` / the summary sentence (see
  // `buildSummary` below), which is the PR-wide view the "reverse import
  // graph, 2 levels" requirement is actually about.
  const downstream: DownstreamImpact[] = result.changedSymbols.map((sym) => {
    const callers = callersBySymbol.get(sym.name) ?? [];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const facts = result.factsByFile?.[c.file];
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
