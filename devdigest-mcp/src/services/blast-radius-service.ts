// Ring 2. Resolves repo/PR, fetches the server's blast-radius payload (same data
// as the browser) and trims it so an agent gets a compact map. No LLM, no local analysis.
import type { BlastRadiusResponse, DownstreamImpact } from '@devdigest/shared';
import type { DevDigestApi } from '../domain/ports.js';
import type { Resolver } from './resolver.js';

/** Symbol groups returned; mirrors the 12 cards the browser shows before "show more". */
export const MAX_GROUPS = 12;
export const MAX_CALLERS_PER_GROUP = 10;
export const MAX_ENDPOINTS = 30;

export interface BlastRadiusResult {
  repo: string;
  pr: number;
  summary: string;
  degraded: boolean;
  reason: BlastRadiusResponse['reason'];
  changed_symbol_count: number;
  /** Only symbols something depends on, with callers as file:line. */
  downstream: DownstreamImpact[];
  impacted_endpoints: string[];
  /** What was cut to keep the answer short. All zero means nothing was cut. */
  omitted: { symbols_without_impact: number; groups: number; callers: number; endpoints: number };
}

const hasImpact = (d: DownstreamImpact) =>
  d.callers.length > 0 || d.endpoints_affected.length > 0 || d.crons_affected.length > 0;

/** Pure: shrink the full server payload to the compact tool answer. */
export function compactBlast(repo: string, pr: number, full: BlastRadiusResponse): BlastRadiusResult {
  const impactful = full.downstream.filter(hasImpact);
  const shown = impactful.slice(0, MAX_GROUPS).map((d) => ({
    ...d,
    callers: d.callers.slice(0, MAX_CALLERS_PER_GROUP),
  }));
  const shownCallers = shown.reduce((n, d) => n + d.callers.length, 0);
  const totalCallers = impactful.reduce((n, d) => n + d.callers.length, 0);
  return {
    repo,
    pr,
    summary: full.summary,
    degraded: full.degraded,
    reason: full.reason,
    changed_symbol_count: full.changed_symbols.length,
    downstream: shown,
    impacted_endpoints: full.impacted_endpoints.slice(0, MAX_ENDPOINTS),
    omitted: {
      symbols_without_impact: full.downstream.length - impactful.length,
      groups: impactful.length - shown.length,
      callers: totalCallers - shownCallers,
      endpoints: Math.max(0, full.impacted_endpoints.length - MAX_ENDPOINTS),
    },
  };
}

export class BlastRadiusService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: Resolver,
  ) {}

  async getBlastRadius(args: { repo: string; pr: number }): Promise<BlastRadiusResult> {
    const { repo, pull } = await this.resolver.resolvePull(args.repo, args.pr);
    const blast = await this.api.getBlast(pull.id);
    return compactBlast(repo.full_name, args.pr, blast);
  }
}
