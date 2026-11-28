/* hooks/query-keys.ts — the one place a React Query key is spelled.
   Every hook and every invalidation builds its key here, so a query and the
   mutation that refreshes it cannot drift apart. */
import type { Provider } from "@devdigest/shared";

type Id = string | null | undefined;

export const queryKeys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  repos: () => ["repos"] as const,
  pulls: (repoId: Id) => ["pulls", repoId] as const,
  pull: (prId: string | number | null | undefined) => ["pull", prId] as const,
  context: (repoId: Id) => ["context", repoId] as const,
  repoIntelState: (repoId: Id) => ["repo-intel-state", repoId] as const,

  agents: () => ["agents"] as const,
  agent: (id: Id) => ["agent", id] as const,
  /** Prefix of every agent's skill links (invalidates them all). */
  agentSkillsAll: () => ["agent-skills"] as const,
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,

  skills: () => ["skills"] as const,
  skill: (id: Id) => ["skill", id] as const,
  skillVersions: (id: Id) => ["skill-versions", id] as const,
  skillVersion: (id: Id, version: number | null | undefined) => ["skill-version", id, version] as const,
  conventions: (repoId: Id) => ["conventions", repoId] as const,
  /** Prefix of every provider's model list (invalidates them all). */
  providerModelsAll: () => ["provider-models"] as const,
  providerModels: (provider: Provider | null | undefined) => ["provider-models", provider] as const,

  prActiveRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  prRuns: (prId: Id) => ["pr-runs", prId] as const,
  reviews: (prId: Id) => ["reviews", prId] as const,
  prComments: (prId: Id) => ["pr-comments", prId] as const,
  runTrace: (runId: Id) => ["run-trace", runId] as const,
};
