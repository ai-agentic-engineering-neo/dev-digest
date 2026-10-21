import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ReviewRunResponse, RunFindings } from '@devdigest/shared';
import { resolvePull, resolveRepo } from '../api/resolve.js';
import { toToolError, toToolResult, UserError } from '../errors.js';
import { terminalRunPayload } from '../run-result.js';
import { MinSeveritySchema, RepoSchema, ResponseFormatSchema } from '../schemas.js';
import { waitForRun } from '../wait.js';
import type { ToolDeps, ToolExtra } from './types.js';

export const NAME = 'devdigest_run_agent_on_pr';
export const TITLE = 'run_agent_on_pr';
export const DESCRIPTION =
  'Run one DevDigest reviewer agent on an imported pull request, wait for it to finish and return its verdict and grounded findings. ' +
  'This is the only tool that starts work: it calls an LLM, costs money and takes from seconds to a few minutes. ' +
  'Identify the PR by repo (name or owner/name) and pr_number, and the agent by agent_id from devdigest_list_agents. ' +
  'If the run is still going after the wait limit, it returns run_id and status running; then call devdigest_get_findings with that run_id.';

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    NAME,
    {
      title: TITLE,
      description: DESCRIPTION,
      inputSchema: {
        repo: RepoSchema,
        pr_number: z.number().int().positive(),
        agent_id: z.string().uuid().describe('Agent id from devdigest_list_agents'),
        response_format: ResponseFormatSchema.default('concise'),
        min_severity: MinSeveritySchema.default('SUGGESTION'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { 'anthropic/requiresUserInteraction': true },
    },
    async (args, extra: ToolExtra) => {
      try {
        const fmt = { format: args.response_format, minSeverity: args.min_severity };
        const repo = await resolveRepo(deps.api, args.repo, extra.signal);
        const pr = await resolvePull(deps.api, repo.id, args.pr_number, extra.signal);
        const started = await deps.api.post<ReviewRunResponse>(
          `/pulls/${pr.id}/review`,
          { agentId: args.agent_id },
          extra.signal,
        );
        const target = started.runs[0];
        if (!target) throw new UserError('The API did not start a run. Check that the agent exists and is enabled.');
        const label = `${target.agent_name} on ${repo.full_name}#${pr.number}`;
        const progressToken = extra._meta?.progressToken;

        const waitStart = deps.now();
        const outcome = await waitForRun({
          fetchRun: () => deps.api.get<RunFindings>(`/runs/${target.run_id}/findings`, extra.signal),
          intervalMs: deps.config.pollMs,
          maxWaitMs: deps.config.maxWaitMs,
          signal: extra.signal,
          sleep: deps.sleep,
          now: deps.now,
          onProgress: async (elapsedS) => {
            if (progressToken === undefined) return;
            await extra
              .sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: elapsedS, message: `${label}: running, ${elapsedS}s` },
              })
              .catch(() => undefined);
          },
        });

        if (outcome.kind === 'finished') return toToolResult(terminalRunPayload(outcome.data, fmt));
        return toToolResult({
          run_id: target.run_id,
          agent_name: target.agent_name,
          status: 'running',
          elapsed_s: Math.round((deps.now() - waitStart) / 1000),
          next: `Call devdigest_get_findings with run_id ${target.run_id} in a minute.`,
        });
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
