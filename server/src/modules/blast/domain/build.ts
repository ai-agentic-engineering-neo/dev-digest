// Pure: maps the repo-intel blast result to the API DTO (snake_case). No I/O, no zod.
import type {
  BlastCounts,
  BlastDownstream,
  BlastIndexSnapshot,
  BlastIntelResult,
  BlastStatus,
  PrBlastRadius,
} from './types.js';

export const EMPTY_BLAST_RESULT: BlastIntelResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  callersOmitted: 0,
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (items: Iterable<string>): string[] => [...new Set(items)].sort(cmp);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function blastSummary(counts: BlastCounts, status: BlastStatus): string {
  const base = [
    plural(counts.symbols, 'changed symbol', 'changed symbols'),
    plural(counts.callers, 'caller', 'callers'),
    plural(counts.endpoints, 'endpoint', 'endpoints'),
    plural(counts.crons, 'cron', 'crons'),
  ].join(' · ');
  return status.degraded ? `${base} (degraded: ${status.reason})` : base;
}

export function buildBlastRadius(input: {
  prId: string;
  headSha: string;
  index: BlastIndexSnapshot;
  result: BlastIntelResult;
  status: BlastStatus;
}): PrBlastRadius {
  const { prId, headSha, index, result, status } = input;

  // changed symbols: dedupe by (file, name), sort file asc, name asc
  const symbolByKey = new Map<string, BlastIntelResult['changedSymbols'][number]>();
  for (const s of result.changedSymbols) {
    const key = `${s.file}\u0000${s.name}`;
    if (!symbolByKey.has(key)) symbolByKey.set(key, s);
  }
  const changedSymbols = [...symbolByKey.values()].sort((a, b) => cmp(a.file, b.file) || cmp(a.name, b.name));

  // group callers by the symbol they reach (viaFile, viaSymbol)
  const groups = new Map<string, { file: string; symbol: string; callers: BlastDownstream['callers']; seen: Set<string> }>();
  for (const c of result.callers) {
    const gKey = `${c.viaFile}\u0000${c.viaSymbol}`;
    let g = groups.get(gKey);
    if (!g) {
      g = { file: c.viaFile, symbol: c.viaSymbol, callers: [], seen: new Set() };
      groups.set(gKey, g);
    }
    const cKey = `${c.file}\u0000${c.symbol}\u0000${c.line}`;
    if (g.seen.has(cKey)) continue;
    g.seen.add(cKey);
    g.callers.push({ name: c.symbol, file: c.file, line: c.line });
  }

  const kindByKey = new Map(changedSymbols.map((s) => [`${s.file}\u0000${s.name}`, s.kind]));
  const facts = result.factsByFile;

  const downstream: BlastDownstream[] = [...groups.values()]
    .filter((g) => g.callers.length > 0)
    .map((g) => {
      const callerFiles = new Set(g.callers.map((c) => c.file));
      const endpoints: string[] = [];
      const crons: string[] = [];
      if (facts) {
        for (const f of callerFiles) {
          const fact = facts[f];
          if (!fact) continue;
          endpoints.push(...fact.endpoints);
          crons.push(...fact.crons);
        }
      }
      return {
        symbol: g.symbol,
        file: g.file,
        kind: kindByKey.get(`${g.file}\u0000${g.symbol}`) ?? 'unknown',
        callers: g.callers,
        endpoints_affected: sortedUnique(endpoints),
        crons_affected: sortedUnique(crons),
      };
    })
    .sort((a, b) => b.callers.length - a.callers.length || cmp(a.file, b.file) || cmp(a.symbol, b.symbol));

  const unattributed = facts ? [] : sortedUnique(result.impactedEndpoints);

  const counts: BlastCounts = {
    symbols: changedSymbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set([...downstream.flatMap((d) => d.endpoints_affected), ...unattributed]).size,
    crons: new Set(downstream.flatMap((d) => d.crons_affected)).size,
  };

  const indexedSha = index.lastIndexedSha || null;

  return {
    pr_id: prId,
    head_sha: headSha,
    indexed_sha: indexedSha,
    link_sha: indexedSha ?? headSha,
    changed_symbols: changedSymbols,
    downstream,
    unattributed_endpoints: unattributed,
    summary: blastSummary(counts, status),
    counts,
    callers_omitted: result.callersOmitted,
    degraded: status.degraded,
    reason: status.reason,
  };
}
