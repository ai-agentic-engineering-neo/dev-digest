/**
 * blast helpers (ring 2): pure mapping from the facade's flat BlastResult to
 * the grouped BlastRadius contract, plus the prior-PR history rows.
 */
import type { BlastCaller, BlastRadius, DownstreamImpact, PrHistoryItem } from '@devdigest/shared';
import { NOTES_MAX_CHARS } from './constants.js';
import type { IntelBlastResult, PriorPull } from './ports.js';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Group the flat caller list under the changed symbol each caller reaches.
 * Endpoints and crons come from the caller files' facts when the persistent
 * index served the map; on the ripgrep fallback the facade only knows a flat
 * endpoint union, which is attributed to every symbol that has callers.
 */
export function toBlastRadius(result: IntelBlastResult): BlastRadius {
  const facts = result.factsByFile;
  const bySymbol = new Map<string, BlastCaller[]>();
  for (const c of result.callers) {
    const list = bySymbol.get(c.viaSymbol) ?? [];
    const caller: BlastCaller = { name: c.symbol, file: c.file, line: c.line };
    if (facts) {
      const f = facts[c.file];
      caller.endpoints = f ? [...f.endpoints] : [];
      caller.crons = f ? [...f.crons] : [];
    }
    list.push(caller);
    bySymbol.set(c.viaSymbol, list);
  }

  // Keep the facade's rank order (callers arrive rank-desc) and make it stable.
  const rankOf = new Map<string, number>();
  result.callers.forEach((c, i) => rankOf.set(`${c.file}|${c.symbol}|${c.viaSymbol}`, i));

  const downstream: DownstreamImpact[] = [];
  for (const [symbol, callers] of bySymbol) {
    callers.sort(
      (a, b) =>
        (rankOf.get(`${a.file}|${a.name}|${symbol}`) ?? 0) -
          (rankOf.get(`${b.file}|${b.name}|${symbol}`) ?? 0) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line,
    );
    const endpoints = facts
      ? sortedUnique(callers.flatMap((c) => c.endpoints ?? []))
      : sortedUnique(result.impactedEndpoints);
    const crons = facts ? sortedUnique(callers.flatMap((c) => c.crons ?? [])) : [];
    downstream.push({ symbol, callers, endpoints_affected: endpoints, crons_affected: crons });
  }
  downstream.sort((a, b) => b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol));

  const changed_symbols = result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind }));
  return { changed_symbols, downstream, summary: summarize(changed_symbols.length, downstream) };
}

/** One plain sentence with the counts the stat row shows. */
export function summarize(symbolCount: number, downstream: DownstreamImpact[]): string {
  if (symbolCount === 0) return 'No symbols declared in the changed files were found in the index.';
  const callers = downstream.reduce((n, d) => n + d.callers.length, 0);
  if (callers === 0) return `${plural(symbolCount, 'changed symbol')}, no downstream callers found.`;
  const files = new Set(downstream.flatMap((d) => d.callers.map((c) => c.file))).size;
  const endpoints = new Set(downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(downstream.flatMap((d) => d.crons_affected)).size;
  const reach = [plural(endpoints, 'endpoint'), plural(crons, 'cron job')];
  return `${plural(symbolCount, 'changed symbol')} reach ${plural(callers, 'caller')} in ${plural(files, 'file')}, ${reach.join(' and ')}.`;
}

/** First non-empty line of a PR body, clipped; empty when the body was never loaded. */
export function firstLine(body: string | null | undefined): string {
  if (!body) return '';
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^(#|<!--|```)/.test(l));
  if (!line) return '';
  return line.length > NOTES_MAX_CHARS ? `${line.slice(0, NOTES_MAX_CHARS - 1)}…` : line;
}

export function toHistory(pulls: PriorPull[]): PrHistoryItem[] {
  return pulls.map((p) => ({
    pr_number: p.number,
    title: p.title,
    // The schema has no merged_at column: the latest known activity stands in.
    merged_at: (p.updatedAt ?? p.openedAt)?.toISOString() ?? '',
    author: p.author,
    files_overlap: p.filesOverlap,
    notes: firstLine(p.body),
  }));
}
