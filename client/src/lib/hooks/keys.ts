/* React Query key factory — one place for every cache key, so an invalidation
   in one hook reaches every consumer. The array VALUES are part of the cache
   contract (docs/ui-architecture.md, "Cache keys"): never change a shape here
   without changing every reader and invalidator with it. */
type Id = string | null | undefined;

export const keys = {
  repos: () => ["repos"] as const,
  pulls: (repoId: Id) => ["pulls", repoId] as const,
  pull: (prId: Id | number) => ["pull", prId] as const,
  reviews: (prId: Id) => ["reviews", prId] as const,
  prRuns: (prId: Id) => ["pr-runs", prId] as const,
  prActiveRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  prComments: (prId: Id) => ["pr-comments", prId] as const,
  runTrace: (runId: Id) => ["run-trace", runId] as const,
  agents: () => ["agents"] as const,
  agent: (id: Id) => ["agent", id] as const,
  providerModels: (provider: Id) => ["provider-models", provider] as const,
  /** Prefix matching every provider — for invalidation only. */
  providerModelsAll: () => ["provider-models"] as const,
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  repoIntelState: (repoId: Id) => ["repo-intel-state", repoId] as const,
  context: (repoId: Id) => ["context", repoId] as const,
  skills: () => ["skills"] as const,
  skill: (id: Id) => ["skill", id] as const,
  skillVersions: (id: Id) => ["skill-versions", id] as const,
  skillVersion: (id: Id, version: Id | number) => ["skill-version", id, version] as const,
  skillStats: (id: Id) => ["skill-stats", id] as const,
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,
  conventions: (repoId: Id) => ["conventions", repoId] as const,
  intent: (prId: Id) => ["intent", prId] as const,
};
