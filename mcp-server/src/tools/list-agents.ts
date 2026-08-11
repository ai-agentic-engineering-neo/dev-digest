import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';

export const listAgentsInputSchema = z.object({});
export type ListAgentsInput = z.infer<typeof listAgentsInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.1). */
export const LIST_AGENTS_DESCRIPTION =
  "Lists the review-agent configurations available in this local Dev Digest workspace: id, name, model, and whether each is enabled. Use this whenever you don't already have a valid agent id for run_agent_on_pr or get_findings, or whenever either of those reports an agent id was not found. Includes disabled agents too (they can still be run explicitly by id) — check the enabled field before choosing one for a general \"run whatever agents exist\" request. This only reads the workspace's agent configuration; it never lists past reviews or runs anything.";

/** Subset of `@devdigest/shared`'s `Agent` contract this tool returns.
 *  `provider` is read off the backend record but dropped from the tool's
 *  response — the calling LLM has no use for it and it's extra tokens on
 *  every call (specs/06-mcp-server.md §3.1). */
interface RawAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export interface ListAgentsResult {
  agents: { id: string; name: string; model: string; enabled: boolean }[];
}

export function makeListAgentsHandler(http: DevDigestHttpClient, apiBaseUrl: string) {
  return async (): Promise<CallToolResult> => {
    try {
      const agents = await http.get<RawAgent[]>('/agents');
      const result: ListAgentsResult = {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          model: a.model,
          enabled: a.enabled,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: commonErrorMessage(err, apiBaseUrl) }] };
    }
  };
}
