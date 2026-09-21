import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';
import { formatPullNotFoundMessage, resolvePull, PullNotFoundError } from '../resolvers/pull.js';
import { toReviewResult, type RawReviewRecord } from './review-shape.js';

export const getFindingsInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe('The pull request number.'),
  agent: z.string().min(1).describe('An agent id, as returned by list_agents.'),
});
export type GetFindingsInput = z.infer<typeof getFindingsInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.3). */
export const GET_FINDINGS_DESCRIPTION =
  'Returns the concise verdict and findings from the most recent completed review by one agent on one pull request. This is a pure read — it never starts, waits for, or retries a run, so it is safe to call repeatedly (e.g. to poll after run_agent_on_pr times out). If no review exists yet for this agent+PR, the response says so explicitly and tells you to call run_agent_on_pr instead of guessing at a result. Returns the same shape as run_agent_on_pr\'s success result (verdict, summary, score, findings).';

/** Subset of `@devdigest/shared`'s `Agent` contract needed for the "does
 *  this agent id even exist" fallback lookup. */
interface RawAgent {
  id: string;
  name: string;
}

export function makeGetFindingsHandler(http: DevDigestHttpClient, apiBaseUrl: string) {
  return async (input: GetFindingsInput): Promise<CallToolResult> => {
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

      // No backend query filter exists for agent_id — GET /pulls/:id/reviews
      // returns everything (newest-first) and the filtering happens here.
      const reviews = await http.get<RawReviewRecord[]>(`/pulls/${pull.id}/reviews`);
      const match = reviews.find((r) => r.agent_id === input.agent);
      if (match) {
        const result = toReviewResult(match);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      // No review yet for this agent — disambiguate "unknown agent id" from
      // "known agent, just hasn't reviewed this PR" via a fallback lookup.
      const agents = await http.get<RawAgent[]>('/agents');
      const knownAgent = agents.find((a) => a.id === input.agent);
      if (!knownAgent) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Agent id '${input.agent}' not found. Call list_agents to see valid agent ids.` }],
        };
      }
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Agent '${knownAgent.name}' has not reviewed this PR yet. Call run_agent_on_pr(repo, pr, agent) to run it.`,
          },
        ],
      };
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
