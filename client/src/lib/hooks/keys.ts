/* hooks/keys.ts — the ONE place query keys are built (TkDodo "query key factory").
   Hooks use these for queries, invalidation and setQueryData, so a key can never
   be mistyped in one place and silently miss the cache. Components never touch
   keys — they call a hook (see frontend-ui-architecture §5). */

type Id = string | number | null | undefined;

export const queryKeys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  /** Prefix: invalidates every provider's model list. */
  providerModelsAll: () => ["provider-models"] as const,
  providerModels: (provider: Id) => ["provider-models", provider] as const,

  repos: () => ["repos"] as const,
  repoIntelState: (repoId: Id) => ["repo-intel-state", repoId] as const,
  context: (repoId: Id) => ["context", repoId] as const,

  pulls: (repoId: Id) => ["pulls", repoId] as const,
  pull: (prId: Id) => ["pull", prId] as const,
  pullByNumber: (repoId: Id, number: Id) => ["pull", "by-number", repoId, number] as const,

  reviews: (prId: Id) => ["reviews", prId] as const,
  prRuns: (prId: Id) => ["pr-runs", prId] as const,
  prActiveRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  prComments: (prId: Id) => ["pr-comments", prId] as const,
  runTrace: (runId: Id) => ["run-trace", runId] as const,

  agents: () => ["agents"] as const,
  agent: (id: Id) => ["agent", id] as const,
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,

  skills: () => ["skills"] as const,
  /** Prefix: everything cached for one skill (detail, preview, stats, versions). */
  skillAll: (id: Id) => ["skill", id] as const,
  skill: (id: Id) => ["skill", id, "detail"] as const,
  skillPreview: (id: Id) => ["skill", id, "preview"] as const,
  skillStats: (id: Id) => ["skill", id, "stats"] as const,
  skillVersions: (id: Id) => ["skill", id, "versions"] as const,
  skillVersion: (id: Id, version: Id) => ["skill", id, "versions", version] as const,
};
