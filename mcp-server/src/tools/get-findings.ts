import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { guarded, ToolError } from '../errors.js';
import { FindingsResult, runningResult } from '../format.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolve.js';
import { agentArg, findingsOk, finishedRunResult, prArg, repoArg, type ToolDeps } from './shared.js';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get DevDigest review findings',
      description:
        'Get the verdict and findings of a DevDigest review run on a PR. Use the run_id from run_agent_on_pr; ' +
        'without run_id returns the latest finished run (of the given agent, if set).',
      inputSchema: {
        repo: repoArg,
        pr: prArg,
        run_id: z.string().min(1).optional().describe('Run id from run_agent_on_pr; omit for the latest finished run'),
        agent: agentArg.optional(),
      },
      outputSchema: FindingsResult.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('get_findings', async ({ repo, pr, run_id, agent }, extra) => {
      const { signal } = extra;
      const repoRow = await resolveRepo(deps.api, repo, signal);
      const pull = await resolvePr(deps.api, repoRow, pr, signal);
      const agentRow = agent ? await resolveAgent(deps.api, agent, signal) : undefined;
      const where = `${repoRow.full_name}#${pr}${agentRow ? ` for agent ${agentRow.name}` : ''}`;
      const base = { prId: pull.id, repo: repoRow.full_name, pr };

      let runs = await deps.api.listRuns(pull.id, signal); // newest first
      if (agentRow) runs = runs.filter((r) => r.agent_id === agentRow.id);

      if (run_id) {
        const run = runs.find((r) => r.run_id === run_id);
        if (!run) throw new ToolError(`Run ${run_id} not found on ${where}. Omit run_id to get the latest finished run.`);
        if (run.status === 'running' || run.status === null) {
          return findingsOk(runningResult({ runId: run.run_id, agent: run.agent_name, repo: base.repo, pr }));
        }
        return findingsOk(await finishedRunResult(deps, { run, ...base }, signal));
      }

      const done = runs.find((r) => r.status === 'done');
      if (done) return findingsOk(await finishedRunResult(deps, { run: done, ...base }, signal));
      const running = runs.find((r) => r.status === 'running');
      if (running) {
        return findingsOk(runningResult({ runId: running.run_id, agent: running.agent_name, repo: base.repo, pr }));
      }
      throw new ToolError(`No finished review on ${where} yet. Start one with run_agent_on_pr.`);
    }),
  );
}
