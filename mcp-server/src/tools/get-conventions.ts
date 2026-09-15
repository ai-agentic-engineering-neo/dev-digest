import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import { resolveRepo, ToolInputError } from '../resolve.js';
import type { ConventionCandidate, ConventionScan } from '../types.js';

interface ConventionsListResult {
  candidates: ConventionCandidate[];
  scan: ConventionScan;
}

const inputSchema = { repo: z.string().describe("Repo full name, e.g. 'owner/name'") };

export function registerGetConventionsTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_conventions',
    {
      description:
        "Returns the accepted house-style conventions DevDigest has extracted for a repo, " +
        'plus when it was last scanned. Only accepted candidates are included, to keep the ' +
        'response concise.',
      inputSchema,
    },
    async ({ repo }) => {
      try {
        const repoRow = await resolveRepo(client, repo);
        const result = await client.get<ConventionsListResult>(
          `/repos/${repoRow.id}/conventions`,
        );
        const accepted = result.candidates.filter((c) => c.accepted);

        if (result.scan.scanned_at === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `repo '${repo}' has never been scanned for conventions yet.`,
              },
            ],
            structuredContent: { candidates: [], scan: result.scan },
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ candidates: accepted, scan: result.scan }) }],
          structuredContent: { candidates: accepted, scan: result.scan },
        };
      } catch (err) {
        if (err instanceof ToolInputError) {
          return { content: [{ type: 'text' as const, text: err.message }], isError: true };
        }
        const message =
          err instanceof ApiCallError
            ? `DevDigest API error (${err.code}): ${err.message}`
            : 'DevDigest API unreachable — is ./scripts/dev.sh running?';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
  );
}
