/* hooks/keys.ts — the single source of TanStack Query keys.
   Every useQuery / invalidateQueries / removeQueries / setQueryData goes through these
   factories, so a key is spelled once and invalidation can't silently miss
   (frontend-architecture §11). The arrays are the exact keys used before the
   factories existed — changing one changes cache identity. */

/** Hooks pass ids straight through (possibly not loaded yet), so keys accept them as-is. */
type Id = string | number | null | undefined;

export const queryKeys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  /** Prefix: invalidates every provider's model list. */
  providerModelsAll: () => ["provider-models"] as const,
  providerModels: (provider: Id) => ["provider-models", provider] as const,

  repos: () => ["repos"] as const,
  pulls: (repoId: Id) => ["pulls", repoId] as const,
  pull: (prId: Id) => ["pull", prId] as const,
  context: (repoId: Id) => ["context", repoId] as const,
  repoIntelState: (repoId: Id) => ["repo-intel-state", repoId] as const,

  agents: () => ["agents"] as const,
  agent: (agentId: Id) => ["agent", agentId] as const,
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,

  skills: () => ["skills"] as const,
  skill: (skillId: Id) => ["skill", skillId] as const,
  skillUsage: (skillId: Id) => ["skill-usage", skillId] as const,
  skillStats: (skillId: Id) => ["skill-stats", skillId] as const,
  skillVersions: (skillId: Id) => ["skill-versions", skillId] as const,
  agentSuggestions: (skillId: Id) => ["agent-suggestions", skillId] as const,
  /** Injection scan of a draft body (POST /skills/scan, keyed by the text itself). */
  skillScan: (body: string) => ["skill-scan", body] as const,

  /** Prefix: every repo's conventions page (its "in skill" badges name skills). */
  conventionsAll: () => ["conventions"] as const,
  conventions: (repoId: Id) => ["conventions", repoId] as const,
  /** Draft preview of a skill from the given convention ids (order-insensitive). */
  conventionSkillDraft: (repoId: Id, ids: readonly string[]) =>
    ["convention-skill-draft", repoId, [...ids].sort().join(",")] as const,
  /** Conflicts left by the last merge into a skill — client cache only, never fetched. */
  mergeConflicts: (skillId: Id) => ["merge-conflicts", skillId] as const,

  prActiveRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  prRuns: (prId: Id) => ["pr-runs", prId] as const,
  reviews: (prId: Id) => ["reviews", prId] as const,
  prComments: (prId: Id) => ["pr-comments", prId] as const,
  runTrace: (runId: Id) => ["run-trace", runId] as const,
};
