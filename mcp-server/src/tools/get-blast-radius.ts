import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';
import { formatPullNotFoundMessage, resolvePull, PullNotFoundError } from '../resolvers/pull.js';

export const getBlastRadiusInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe('The pull request number.'),
});
export type GetBlastRadiusInput = z.infer<typeof getBlastRadiusInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.5). */
export const GET_BLAST_RADIUS_DESCRIPTION =
  'Maps which files, callers, and API endpoints/crons are impacted by a pull request\'s changed symbols, so a reviewer can prioritize what else to check beyond the diff itself. This is a pure read over the repo\'s code index — it never runs an LLM call and never mutates anything, so it is safe to call repeatedly. When the repo\'s index is only partially built or unavailable, the response\'s status/degraded_reason fields say so explicitly and the returned data may be incomplete — do not treat a thin result as proof nothing else is impacted in that case. An empty changed_symbols list means none of the changed files declare a function, method, or class the index tracks; an empty downstream list for a changed symbol means the index found no cross-file callers of it, not that the check was skipped.';

/** Subset of `@devdigest/shared`'s `BlastCaller` contract this tool reads. */
interface RawBlastCaller {
  name: string;
  file: string;
  line: number;
  rank: number;
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

      const raw = await http.get<RawBlastRadiusResponse>(`/pulls/${pull.id}/blast`);
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
