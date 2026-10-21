import type { BlastCaller, BlastDegradedReason, BlastRadius } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CALLABLE_KINDS, DEGRADED_REASONS } from "./constants";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** The four numbers of the stat row (endpoints and crons are distinct across symbols). */
export function computeStats(data: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of data.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: data.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** `rateLimit()` for callables, the bare name otherwise. Unknown symbols (no declaration row) stay bare. */
export function symbolLabel(name: string, kinds: ReadonlyMap<string, string>): string {
  const kind = kinds.get(name);
  return kind && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}

/** name → kind of the changed symbols, so the tree can label them. */
export function kindsByName(data: BlastRadius): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const s of data.changed_symbols) if (!m.has(s.name)) m.set(s.name, s.kind);
  return m;
}

/** Caller files are not in the PR diff, so a caller links to GitHub at the PR head. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  caller: BlastCaller,
): string | null {
  if (!repoFullName || !headSha) return null;
  return githubBlobUrl(repoFullName, headSha, caller.file, caller.line);
}

/** i18n key suffix for a degraded reason; `no_data` when the server sent none we know. */
export function reasonKey(reason: BlastDegradedReason | null | undefined): BlastDegradedReason {
  return reason && DEGRADED_REASONS.has(reason) ? reason : "no_data";
}

/** "2026-03-18" from an ISO timestamp; "—" when unknown. */
export function isoDate(iso: string | null | undefined): string {
  return iso && iso.length >= 10 && !Number.isNaN(Date.parse(iso)) ? iso.slice(0, 10) : "—";
}
