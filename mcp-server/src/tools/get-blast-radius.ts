import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const getBlastRadiusInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
  pr: z.number().int().positive().describe('The pull request number.'),
});
export type GetBlastRadiusInput = z.infer<typeof getBlastRadiusInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.5). */
export const GET_BLAST_RADIUS_DESCRIPTION =
  'STUB — always returns a structured "not implemented" result; it never returns real blast-radius data in this version. Once implemented, this tool will map which files, callers, and API endpoints are impacted by a pull request\'s changed symbols, so a reviewer can prioritize what else to check. Until then: do not retry this call expecting different data on a later attempt, and do not fabricate a blast-radius analysis yourself from the diff — just proceed with the review without blast-radius context. Takes the same repo/pr arguments the real implementation will use, so no caller needs to change when it ships.';

export interface BlastRadiusStubResult {
  status: 'not_implemented';
  repo: string;
  pr: number;
  message: string;
}

const STUB_MESSAGE =
  'Blast radius analysis is not implemented yet in this MCP server. This is a placeholder — do not treat it as real impact analysis and do not retry expecting different data.';

/**
 * Intentional stub (specs/06-mcp-server.md §3.5). No HTTP endpoint exposes
 * `RepoIntel.getBlastRadius` (only `/index-state` and `/resync` exist on
 * `repo-intel/routes.ts`) — this tool makes ZERO backend calls, on purpose,
 * so a typo'd repo/pr gets the same answer as a valid one. That's why it
 * doesn't take an `http` client at all, unlike every other tool here.
 */
export function makeGetBlastRadiusHandler() {
  return async (input: GetBlastRadiusInput): Promise<CallToolResult> => {
    const result: BlastRadiusStubResult = {
      status: 'not_implemented',
      repo: input.repo,
      pr: input.pr,
      message: STUB_MESSAGE,
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  };
}
