import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';
import { formatPullNotFoundMessage, resolvePull, PullNotFoundError } from '../resolvers/pull.js';

export const getBlastRadiusInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe('The pull request number.'),
  include_type_only: z
    .boolean()
    .optional()
    .describe('Also follow type-only imports/usages when computing impact. Defaults to false (runtime impact only).'),
});
export type GetBlastRadiusInput = z.infer<typeof getBlastRadiusInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.5). */
export const GET_BLAST_RADIUS_DESCRIPTION =
  'Maps which files, callers, and API endpoints/crons are impacted by a pull request\'s changed symbols, so a reviewer can prioritize what else to check beyond the diff itself. This is a pure read over the repo\'s code index — it never runs an LLM call and never mutates anything, so it is safe to call repeatedly. When the repo\'s index is only partially built or unavailable, the response\'s status/degraded_reason fields say so explicitly and the returned data may be incomplete — do not treat a thin result as proof nothing else is impacted in that case. An empty changed_symbols list means the pull request changed no supported source file (every changed code file yields at least its module scope); an empty downstream list for a changed symbol means the index found no cross-file callers of it, not that the check was skipped. The result also lists affected entry points (endpoints, crons, pages) and affected tests with totals, and follows only runtime edges unless include_type_only is set to true.';

/** Subset of `@devdigest/shared`'s `BlastCaller` contract this tool reads. */
interface RawBlastCaller {
  name: string;
  file: string;
  line: number;
  rank: number;
}

/** Subset of `BlastEntryPoint` (dependency-graph contract) this tool reads. */
interface RawEntryPoint {
  path: string;
  type: string;
  label: string;
  depth: number;
}

/** Subset of `BlastAffectedTest` this tool reads. */
interface RawAffectedTest {
  path: string;
  depth: number;
}

/** Subset of `BlastIndexInfo` this tool reads. */
interface RawIndexInfo {
  lowConfidence?: boolean;
  reindexing?: { state: 'queued' | 'running'; done: number; total: number } | null;
}

/** Subset of `OverlayInfo` this tool reads. */
interface RawOverlayInfo {
  staleOverlay?: boolean;
  overlayDegraded?: boolean;
}

/** Subset of `BlastGraph` this tool reads — nodes/edges are deliberately ignored. */
interface RawBlastGraph {
  entryPoints?: { items: RawEntryPoint[]; total: number };
  tests?: { items: RawAffectedTest[]; total: number };
  truncation?: { truncated: boolean };
}

/** Subset of `@devdigest/shared`'s `DownstreamImpact` contract this tool reads. */
interface RawDownstreamImpact {
  symbol: string;
  callers: RawBlastCaller[];
  endpoints_affected: string[];
  crons_affected: string[];
}

/** Subset of `@devdigest/shared`'s `ChangedSymbol` contract this tool reads. */
interface RawChangedSymbol {
  name: string;
  file: string;
  kind: string;
}

/** Subset of `@devdigest/shared`'s `BlastRadius` contract this tool reads. */
interface RawBlastRadius {
  changed_symbols: RawChangedSymbol[];
  downstream: RawDownstreamImpact[];
}

/** `GET /pulls/:id/blast`'s response envelope (specs/07-blast-radius.md §API). */
interface RawBlastRadiusResponse {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  degradedReason?: string;
  data: RawBlastRadius;
  index?: RawIndexInfo;
  overlay?: RawOverlayInfo;
  graph?: RawBlastGraph;
}

export interface ConciseBlastRadius {
  status: RawBlastRadiusResponse['status'];
  degraded_reason?: string;
  changed_symbols: RawChangedSymbol[];
  downstream: {
    symbol: string;
    callers: { file: string; line: number; rank: number }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  entry_points: { items: RawEntryPoint[]; total: number };
  affected_tests: { items: RawAffectedTest[]; total: number };
  index: {
    low_confidence: boolean;
    reindexing?: { state: 'queued' | 'running'; done: number; total: number };
    stale_overlay: boolean;
    overlay_degraded: boolean;
    truncated: boolean;
  };
}

/**
 * Real implementation (specs/07-blast-radius.md) — replaces the former
 * intentional stub now that `GET /pulls/:id/blast` exists. Same
 * `resolveRepo` → `resolvePull` shape `get-findings.ts` uses.
 */
export function makeGetBlastRadiusHandler(http: DevDigestHttpClient, apiBaseUrl: string) {
  return async (input: GetBlastRadiusInput): Promise<CallToolResult> => {
    try {
      const repo = await resolveRepo(http, input.repo);
      let pull;
      try {
        pull = await resolvePull(http, repo.id, input.pr);
      } catch (err) {
        if (err instanceof PullNotFoundError) {
          return { isError: true, content: [{ type: 'text', text: formatPullNotFoundMessage(err, repo.full_name) }] };
        }
        throw err;
      }

      const raw = await http.get<RawBlastRadiusResponse>(`/pulls/${pull.id}/blast?include_type_only=${input.include_type_only === true}`);
      const result: ConciseBlastRadius = {
        status: raw.status,
        ...(raw.degradedReason ? { degraded_reason: raw.degradedReason } : {}),
        changed_symbols: raw.data.changed_symbols,
        downstream: raw.data.downstream.map((d) => ({
          symbol: d.symbol,
          callers: d.callers.map((c) => ({ file: c.file, line: c.line, rank: c.rank })),
          endpoints_affected: d.endpoints_affected,
          crons_affected: d.crons_affected,
        })),
        entry_points: raw.graph?.entryPoints ?? { items: [], total: 0 },
        affected_tests: raw.graph?.tests ?? { items: [], total: 0 },
        index: {
          low_confidence: raw.index?.lowConfidence ?? false,
          ...(raw.index?.reindexing ? { reindexing: raw.index.reindexing } : {}),
          stale_overlay: raw.overlay?.staleOverlay ?? false,
          overlay_degraded: raw.overlay?.overlayDegraded ?? false,
          truncated: raw.graph?.truncation?.truncated ?? false,
        },
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: mapError(err, apiBaseUrl) }] };
    }
  };
}

function mapError(err: unknown, apiBaseUrl: string): string {
  if (err instanceof Error && (err.name === 'RepoNotFoundError' || err.name === 'AmbiguousRepoError')) {
    return err.message;
  }
  return commonErrorMessage(err, apiBaseUrl);
}
