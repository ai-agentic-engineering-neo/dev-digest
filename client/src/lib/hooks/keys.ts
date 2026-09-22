/* hooks/keys.ts — the one query-key scheme for every TanStack Query hook.
   Keys are hierarchical, so invalidating a prefix covers its children:
     prKeys.detail(prId)   → the PR itself + its runs, active runs, reviews, comments
     repoKeys.detail(id)   → a repo's pulls list, context files and index state
   Hooks and mutations reference these factories — never inline key literals. */

type Id = string | number | null | undefined;

export const settingsKeys = {
  all: ["settings"] as const,
  current: () => [...settingsKeys.all, "current"] as const,
  secretsStatus: () => [...settingsKeys.all, "secrets-status"] as const,
};

export const providerKeys = {
  all: ["providers"] as const,
  models: (provider: Id) => [...providerKeys.all, provider, "models"] as const,
};

export const repoKeys = {
  all: ["repos"] as const,
  list: () => [...repoKeys.all, "list"] as const,
  detail: (repoId: Id) => [...repoKeys.all, "detail", repoId] as const,
  pulls: (repoId: Id) => [...repoKeys.detail(repoId), "pulls"] as const,
  context: (repoId: Id) => [...repoKeys.detail(repoId), "context"] as const,
  intelState: (repoId: Id) => [...repoKeys.detail(repoId), "intel-state"] as const,
};

export const prKeys = {
  all: ["pulls"] as const,
  /** Key of the PR detail query AND the prefix of everything scoped to that PR. */
  detail: (prId: Id) => [...prKeys.all, prId] as const,
  runs: (prId: Id) => [...prKeys.detail(prId), "runs"] as const,
  activeRuns: (prId: Id) => [...prKeys.detail(prId), "active-runs"] as const,
  reviews: (prId: Id) => [...prKeys.detail(prId), "reviews"] as const,
  comments: (prId: Id) => [...prKeys.detail(prId), "comments"] as const,
};

/** PR-scoped children a finished run changes (used when the PR id is unknown). */
export const RUN_SCOPED_PR_KEYS = ["runs", "active-runs", "reviews"] as const;

export const agentKeys = {
  all: ["agents"] as const,
  list: () => [...agentKeys.all, "list"] as const,
  detail: (id: Id) => [...agentKeys.all, "detail", id] as const,
};

export const runKeys = {
  all: ["runs"] as const,
  trace: (runId: Id) => [...runKeys.all, runId, "trace"] as const,
};
