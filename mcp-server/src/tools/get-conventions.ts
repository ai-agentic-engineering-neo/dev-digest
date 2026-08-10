import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';

export const getConventionsInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
});
export type GetConventionsInput = z.infer<typeof getConventionsInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.4). */
export const GET_CONVENTIONS_DESCRIPTION =
  'Returns this repository\'s already-accepted coding conventions — house-style rules a reviewer should apply, each with the file/line evidence that justified it. Read-only against the last completed convention-extraction scan; it does not run a new extraction and takes no PR or agent argument. If the repo has never been scanned, the response says so explicitly (extraction itself is only available from the Dev Digest web UI today, not from this tool) rather than returning an empty list that could be mistaken for "this repo has no conventions." Returns only accepted conventions — candidates still pending review or already rejected are omitted, since surfacing them risks a reviewer treating an unvetted or rejected rule as house style.';

/** Subset of `@devdigest/shared`'s `ConventionCandidate`/`ConventionScan`/
 *  `ConventionsList` contracts this tool reads. */
interface RawConventionCandidate {
  category: string;
  rule: string;
  evidence_path: string | null;
  evidence_start_line: number | null;
  evidence_end_line: number | null;
  evidence_snippet: string | null;
  confidence: number | null;
  status: string;
}

interface RawConventionScan {
  created_at: string;
}

interface RawConventionsList {
  scan: RawConventionScan | null;
  candidates: RawConventionCandidate[];
}

export interface ConciseConvention {
  rule: string;
  category: string;
  evidence_path: string | null;
  evidence_start_line: number | null;
  evidence_end_line: number | null;
  evidence_snippet: string | null;
  confidence: number | null;
}

export interface GetConventionsResult {
  repo: string;
  scanned_at: string | null;
  conventions: ConciseConvention[];
  note?: string;
}

const NEVER_SCANNED_NOTE =
  'This repository has not been scanned for conventions yet. Run the extractor from the Dev Digest web UI (Repo -> Conventions -> Extract), then call this tool again.';

export function makeGetConventionsHandler(http: DevDigestHttpClient, apiBaseUrl: string) {
  return async (input: GetConventionsInput): Promise<CallToolResult> => {
    try {
      const repo = await resolveRepo(http, input.repo);
      const list = await http.get<RawConventionsList>(`/repos/${repo.id}/conventions`);

      if (!list.scan) {
        const result: GetConventionsResult = {
          repo: repo.full_name,
          scanned_at: null,
          conventions: [],
          note: NEVER_SCANNED_NOTE,
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      const accepted = list.candidates.filter((c) => c.status === 'accepted');
      const result: GetConventionsResult = {
        repo: repo.full_name,
        scanned_at: list.scan.created_at,
        conventions: accepted.map((c) => ({
          rule: c.rule,
          category: c.category,
          evidence_path: c.evidence_path,
          evidence_start_line: c.evidence_start_line,
          evidence_end_line: c.evidence_end_line,
          evidence_snippet: c.evidence_snippet,
          confidence: c.confidence,
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
