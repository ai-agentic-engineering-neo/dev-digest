import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiRun } from '../api-client.js';
import { guarded, ToolError } from '../errors.js';
import { buildGroups, MAX_RUNS, reviewsText, ReviewsResult, runningNextStep } from '../format.js';
import { resolveAgent, resolvePr } from '../resolve.js';
import { agentIdArg, assertRunSucceeded, ok, optionalRepoArg, prIdArg, reviewOfRun, type ToolDeps } from './shared.js';

/** One run per agent (the newest), keeping input order (newest first). Runs without an agent stay as-is. */
function latestPerAgent(runs: ApiRun[]): ApiRun[] {
  const seen = new Set<string>();
  return runs.filter((r) => {
    if (r.agent_id === null) return true;
    if (seen.has(r.agent_id)) return false;
    seen.add(r.agent_id);
    return true;
  });
}

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get DevDigest review findings',
      description:
        'Get the verdicts and findings of DevDigest reviews on a PR, grouped per agent run. ' +
        'By default: the latest finished run of EVERY agent. run_id → that run; agent_id → that agent only; all_runs → every finished run (newest first).',
      inputSchema: {
        repo: optionalRepoArg,
        pr_id: prIdArg,
        run_id: z.string().min(1).optional().describe('Run id from run_agent_on_pr; omit for the latest run of every agent'),
        agent_id: agentIdArg.optional(),
        all_runs: z
          .boolean()
          .default(false)
          .describe('true = every finished run (up to 10, newest first) instead of the latest one per agent'),
      },
      outputSchema: ReviewsResult.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('get_findings', async ({ repo, pr_id, run_id, agent_id, all_runs }, extra) => {
      const { signal } = extra;
      const { repo: repoRow, pull } = await resolvePr(deps.api, repo, pr_id, signal);
      const agentRow = agent_id ? await resolveAgent(deps.api, agent_id, signal) : undefined;
      const where = `${repoRow.full_name}#${pull.number}${agentRow ? ` for agent ${agentRow.name}` : ''}`;

      let runs = await deps.api.listRuns(pull.id, signal); // newest first
      if (agentRow) runs = runs.filter((r) => r.agent_id === agentRow.id);

      let done: ApiRun[];
      let running: ApiRun[];
      if (run_id) {
        const run = runs.find((r) => r.run_id === run_id);
        if (!run) throw new ToolError(`Run ${run_id} not found on ${where}. Omit run_id to get the latest runs.`);
        assertRunSucceeded(run);
        const isRunning = run.status === 'running' || run.status === null;
        done = isRunning ? [] : [run];
        running = isRunning ? [run] : [];
      } else {
        const finished = runs.filter((r) => r.status === 'done');
        done = all_runs ? finished : latestPerAgent(finished);
        // An agent whose newest run is still going is reported as running (its older result is still shown).
        running = latestPerAgent(runs.filter((r) => r.status === 'running'));
      }

      const shown = done.slice(0, MAX_RUNS);
      const reviews = shown.length ? await deps.api.listReviews(pull.id, signal) : [];
      const items = shown.map((run) => ({ run, review: reviewOfRun(reviews, run) }));
      if (items.length === 0 && running.length === 0) {
        throw new ToolError(`No finished review on ${where} yet. Start one with run_agent_on_pr.`);
      }

      const { groups, counts, truncated } = buildGroups(items);
      const first = running[0];
      const result: ReviewsResult = {
        status: groups.length > 0 ? 'done' : 'running',
        repo: repoRow.full_name,
        pr_number: pull.number,
        pr_id: pull.id,
        reviews: groups,
        running: running.map((r) => ({ run_id: r.run_id, agent_id: r.agent_id, agent_name: r.agent_name })),
        counts,
        truncated,
        runs_omitted: done.length - shown.length,
        ...(first ? { next_step: runningNextStep(repoRow.full_name, pull.number, first.run_id) } : {}),
      };
      return ok(result, reviewsText(result));
    }),
  );
}
