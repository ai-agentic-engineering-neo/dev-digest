/** Human identifiers (owner/name, PR number, agent name) → DevDigest records. */
import type { ApiAgent, ApiPull, ApiRepo, DevDigestApi } from './api-client.js';
import { ToolError } from './errors.js';

export async function resolveRepo(api: DevDigestApi, repo: string, signal?: AbortSignal): Promise<ApiRepo> {
  const repos = await api.listRepos(signal);
  const wanted = repo.trim().toLowerCase();
  const found = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (found) return found;
  const imported = repos.map((r) => r.full_name).join(', ') || 'none';
  throw new ToolError(
    `Repository "${repo}" is not imported in DevDigest. Imported: ${imported}. ` +
      `Add it in the DevDigest UI (Repos → Add) first.`,
  );
}

export async function resolvePr(
  api: DevDigestApi,
  repo: ApiRepo,
  pr: number,
  signal?: AbortSignal,
): Promise<ApiPull & { id: string }> {
  const pulls = await api.listPulls(repo.id, signal);
  const found = pulls.find((p) => p.number === pr);
  if (found?.id) return { ...found, id: found.id };
  throw new ToolError(
    `PR #${pr} not found in ${repo.full_name} (DevDigest lists open and recently closed PRs). ` +
      `Check the number with: gh pr list -R ${repo.full_name}`,
  );
}

/** Match by id, else by name (case-insensitive). Ambiguous names are an error. */
export async function resolveAgent(api: DevDigestApi, agent: string, signal?: AbortSignal): Promise<ApiAgent> {
  const agents = await api.listAgents(signal);
  const wanted = agent.trim().toLowerCase();
  const byId = agents.find((a) => a.id.toLowerCase() === wanted);
  if (byId) return byId;
  const byName = agents.filter((a) => a.name.toLowerCase() === wanted);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    const list = byName.map((a) => `${a.name} (id ${a.id})`).join(', ');
    throw new ToolError(`Agent name "${agent}" matches several agents: ${list}. Pass the id.`);
  }
  throw new ToolError(`Agent "${agent}" not found. Call list_agents to see available agents.`);
}
