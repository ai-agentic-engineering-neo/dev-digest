import type { BlastCaller, BlastDegradedReason, BlastRadiusResponse } from "@devdigest/shared";
import { DEGRADED_REASON_KEY } from "./constants";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

export interface SymbolRow {
  name: string;
  callers: BlastCaller[];
  endpoints: string[];
  crons: string[];
}

type BlastData = Pick<BlastRadiusResponse, "changed_symbols" | "downstream" | "impacted_endpoints">;

/** Callers are unique by file + name: the same function calling two symbols counts once. */
export function uniqueCallerCount(downstream: BlastData["downstream"]): number {
  const seen = new Set<string>();
  for (const d of downstream) for (const c of d.callers) seen.add(`${c.file}:${c.name}`);
  return seen.size;
}

export function uniqueCronCount(downstream: BlastData["downstream"]): number {
  const seen = new Set<string>();
  for (const d of downstream) for (const c of d.crons_affected) seen.add(c);
  return seen.size;
}

export function blastStats(data: BlastData): BlastStats {
  return {
    symbols: symbolRows(data).length, // == rendered rows (unique by name)
    callers: uniqueCallerCount(data.downstream),
    endpoints: data.impacted_endpoints.length,
    crons: uniqueCronCount(data.downstream),
  };
}

/**
 * One row per changed symbol (deduped by name), joined to its downstream impact.
 * A symbol with no downstream entry is still listed; downstream entries whose
 * symbol is not in `changed_symbols` are appended so nothing is dropped.
 */
export function symbolRows(data: BlastData): SymbolRow[] {
  const impact = new Map(data.downstream.map((d) => [d.symbol, d]));
  const names: string[] = [];
  for (const sym of data.changed_symbols) if (!names.includes(sym.name)) names.push(sym.name);
  for (const d of data.downstream) if (!names.includes(d.symbol)) names.push(d.symbol);
  return names.map((name) => {
    const d = impact.get(name);
    return {
      name,
      callers: d?.callers ?? [],
      endpoints: d?.endpoints_affected ?? [],
      crons: d?.crons_affected ?? [],
    };
  });
}

export function degradedReasonKey(reason: BlastDegradedReason | null): string | null {
  return reason ? DEGRADED_REASON_KEY[reason] : null;
}
