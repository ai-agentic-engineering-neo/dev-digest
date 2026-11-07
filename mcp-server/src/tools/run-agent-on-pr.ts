import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guarded, ToolError } from '../errors.js';
import { FindingsResult, runningResult } from '../format.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolve.js';
import { agentArg, findingsOk, finishedRunResult, prArg, repoArg, type ToolDeps } from './shared.js';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a DevDigest review on a PR',
      description:
        'Run one DevDigest reviewer agent on a pull request, wait for it and return the real findings (verdict, severity, file:line). ' +
        'Starts a paid LLM run; if it takes too long, returns status "running" and a run_id for get_findings.',
      inputSchema: { repo: repoArg, pr: prArg, agent: agentArg },
      outputSchema: FindingsResult.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guarded('run_agent_on_pr', async ({ repo, pr, agent }, extra) => {
      const { signal } = extra;
      const found = await resolveAgent(deps.api, agent, signal);
      const repoRow = await resolveRepo(deps.api, repo, signal);
      const pull = await resolvePr(deps.api, repoRow, pr, signal);
      const disabledWarning = found.enabled
        ? undefined
        : `Agent "${found.name}" is disabled in DevDigest; it was run anyway because it was requested explicitly.`;

      // DevDigest does not deduplicate runs: join an active run of this agent instead of paying twice.
      const active = (await deps.api.listRuns(pull.id, signal)).find(
        (r) => r.status === 'running' && r.agent_id === found.id,
      );
      let runId: string;
      let reuseWarning: string | undefined;
      if (active) {
        runId = active.run_id;
        reuseWarning =
          `Agent "${found.name}" was already running on ${repoRow.full_name}#${pr} (run ${runId}); ` +
          `waited for that run instead of starting a duplicate paid run.`;
      } else {
        const started = await deps.api.startReview(pull.id, found.id, signal);
        const startedId = started[0]?.run_id;
        if (!startedId) throw new ToolError('DevDigest did not start a run. Retry run_agent_on_pr.');
        runId = startedId;
      }
      const warning = [disabledWarning, reuseWarning].filter(Boolean).join(' ') || undefined;

      const base = { repo: repoRow.full_name, pr, ...(warning ? { warning } : {}) };
      const progressToken = extra._meta?.progressToken;
      const deadline = Date.now() + deps.config.runTimeoutMs;
      let tick = 0;
      while (Date.now() < deadline) {
        await sleep(Math.min(deps.config.pollMs, Math.max(0, deadline - Date.now())), signal);
        const run = (await deps.api.listRuns(pull.id, signal)).find((r) => r.run_id === runId);
        if (run && run.status !== 'running' && run.status !== null) {
          return findingsOk(await finishedRunResult(deps, { run, prId: pull.id, ...base }, signal));
        }
        if (progressToken !== undefined) {
          tick++;
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress: tick, message: `${found.name} is reviewing ${repoRow.full_name}#${pr}…` },
          });
        }
      }
      return findingsOk(runningResult({ runId, agent: found.name, ...base }));
    }),
  );
}
