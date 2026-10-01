// Ring 2. Lazy, cached health check in front of the port: the first tool call
// verifies `/health` (so "web UI instead of API" and "API down" fail with a
// clear message); success is cached for the process lifetime, failure is not
// (the user may start the API afterwards). Concurrent callers share one probe.
import type { DevDigestApi } from '../domain/ports.js';

export function withHealthGate(api: DevDigestApi): DevDigestApi {
  let healthy = false;
  let inflight: Promise<void> | undefined;

  const ensure = async (): Promise<void> => {
    if (healthy) return;
    inflight ??= api
      .health()
      .then(() => {
        healthy = true;
      })
      .finally(() => {
        inflight = undefined;
      });
    await inflight;
  };

  return {
    health: () => api.health(),
    listAgents: async () => (await ensure(), api.listAgents()),
    listRepos: async () => (await ensure(), api.listRepos()),
    listPulls: async (repoId) => (await ensure(), api.listPulls(repoId)),
    listConventions: async (repoId) => (await ensure(), api.listConventions(repoId)),
    startReview: async (prId, agentId) => (await ensure(), api.startReview(prId, agentId)),
    listRuns: async (prId) => (await ensure(), api.listRuns(prId)),
    listReviews: async (prId) => (await ensure(), api.listReviews(prId)),
    waitForRunEnd: async (runId, signal, onEvent) => (await ensure(), api.waitForRunEnd(runId, signal, onEvent)),
  };
}
