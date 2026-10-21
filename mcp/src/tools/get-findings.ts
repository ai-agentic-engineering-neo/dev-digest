import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RunFindings, RunSummary } from '@devdigest/shared';
import { resolvePull, resolveRepo } from '../api/resolve.js';
import { toToolError, toToolResult, UserError } from '../errors.js';
import { terminalRunPayload } from '../run-result.js';
import { MinSeveritySchema, RepoSchema, ResponseFormatSchema } from '../schemas.js';
import type { ToolDeps, ToolExtra } from './types.js';

export const NAME = 'devdigest_get_findings';
export const TITLE = 'get_findings';
export const DESCRIPTION =
  'Return a concise verdict for an already-finished DevDigest review run: verdict, score, counts by severity and the top findings with file and line. ' +
  'Pass run_id, or repo plus pr_number (optionally agent_id) for the latest finished run on that PR. ' +
  'Use response_format detailed for rationale and suggestions, and min_severity to drop lower severities. ' +
  'Does not start a review; use devdigest_run_agent_on_pr for that.';

const EXAMPLE = 'Pass run_id, or repo and pr_number, e.g. { "repo": "acme/payments-api", "pr_number": 482 }.';

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    NAME,
    {
      title: TITLE,
      description: DESCRIPTION,
      inputSchema: {
        run_id: z.string().uuid().optional().describe('Run id from devdigest_run_agent_on_pr'),
        repo: RepoSchema.optional(),
        pr_number: z.number().int().positive().optional(),
        agent_id: z.string().uuid().optional().describe('Only consider runs of this agent'),
        response_format: ResponseFormatSchema.default('concise'),
        min_severity: MinSeveritySchema.default('SUGGESTION'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra: ToolExtra) => {
      try {
        const fmt = { format: args.response_format, minSeverity: args.min_severity };
        let runId = args.run_id;
        if (!runId) {
          if (!args.repo || args.pr_number === undefined) throw new UserError(`Missing target. ${EXAMPLE}`);
          const repo = await resolveRepo(deps.api, args.repo, extra.signal);
          const pr = await resolvePull(deps.api, repo.id, args.pr_number, extra.signal);
          const runs = await deps.api.get<RunSummary[]>(`/pulls/${pr.id}/runs`, extra.signal);
          const mine = runs.filter((r) => !args.agent_id || r.agent_id === args.agent_id);
          const finished = mine.find((r) => r.status !== 'running');
          if (!finished) {
            const running = mine.find((r) => r.status === 'running');
            if (running) {
              return toToolResult({ run_id: running.run_id, status: 'running', next: 'Run still in progress, retry later.' });
            }
            throw new UserError(
              `No finished run found for ${repo.full_name}#${pr.number}. Start one with devdigest_run_agent_on_pr.`,
            );
          }
          runId = finished.run_id;
        }
        const data = await deps.api.get<RunFindings>(`/runs/${runId}/findings`, extra.signal);
        if (data.run.status === 'running') {
          return toToolResult({ run_id: runId, status: 'running', next: 'Run still in progress, retry later.' });
        }
        return toToolResult(terminalRunPayload(data, fmt));
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
