import type {
  BlastCaller,
  BlastDegradedReason,
  BlastRadiusResponse,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, DegradedReason } from '../repo-intel/types.js';

// Compile-time guard: the facade's DegradedReason must stay assignable to the
// wire enum, otherwise a new reason would fail response serialization at runtime.
type _AssertReasonAssignable = DegradedReason extends BlastDegradedReason ? true : never;
export const _reasonAssignable: _AssertReasonAssignable = true;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const sortedUnique = (xs: string[]) => [...new Set(xs)].sort();

export function buildSummary(
  symbols: number,
  callers: number,
  endpoints: number,
  crons: number,
): string {
  const head = plural(symbols, 'changed symbol', 'changed symbols');
  const ep = plural(endpoints, 'endpoint', 'endpoints');
  if (callers === 0) {
    return endpoints > 0
      ? `${head}, no downstream callers found, ${ep} still affected.`
      : `${head}, no downstream callers found.`;
  }
  return (
    `${head}, ${plural(callers, 'downstream caller', 'downstream callers')}, ` +
    `${ep} and ${plural(crons, 'cron', 'crons')} affected.`
  );
}

/** Pure mapping of the facade result to the wire response. No LLM, no IO. */
export function toBlastRadiusResponse(result: BlastResult): BlastRadiusResponse {
  // Known limitation: BlastCallerRow.viaSymbol is a bare name, so same-named symbols in different files merge into one group.
  const groups = new Map<string, BlastCallerRow[]>();
  const declFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    if (!groups.has(s.name)) groups.set(s.name, []);
    const files = declFiles.get(s.name);
    if (files) files.add(s.file);
    else declFiles.set(s.name, new Set([s.file]));
  }
  // A symbol's own declaring file is never one of its callers. The facade only
  // enforces this on its ripgrep path, so the persistent path is filtered here.
  const callerRows = result.callers.filter((c) => !declFiles.get(c.viaSymbol)?.has(c.file));
  for (const c of callerRows) {
    const g = groups.get(c.viaSymbol);
    if (g) g.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const facts = result.factsByFile;
  const downstream: DownstreamImpact[] = [];
  for (const [symbol, rows] of groups) {
    const files = [...new Set(rows.map((r) => r.file))];
    const callers: BlastCaller[] = rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line }));
    downstream.push({
      symbol,
      callers,
      endpoints_affected: sortedUnique(files.flatMap((f) => facts?.[f]?.endpoints ?? [])),
      crons_affected: sortedUnique(files.flatMap((f) => facts?.[f]?.crons ?? [])),
    });
  }

  const uniqueCallers = new Set(callerRows.map((c) => `${c.file}:${c.symbol}`)).size;
  const crons = new Set(downstream.flatMap((d) => d.crons_affected)).size;

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: buildSummary(
      downstream.length, // unique-by-name groups, == rows the client renders
      uniqueCallers,
      result.impactedEndpoints.length,
      crons,
    ),
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
    impacted_endpoints: result.impactedEndpoints,
  };
}
