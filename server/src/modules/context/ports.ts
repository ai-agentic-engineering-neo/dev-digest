/** A workspace-checked repo, as the context module needs it. */
export interface ContextRepoRef { id: string; owner: string; name: string; clonePath: string | null }

/**
 * Storage for the context module. `agent_context_docs` has no workspace_id: callers must check
 * BOTH the agent and the repo with the *InWorkspace methods before reading or writing links.
 */
export interface ContextRepositoryPort {
  repoInWorkspace(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined>;
  agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean>;
  /** Attached paths ordered by position. */
  listAttachments(agentId: string, repoId: string): Promise<string[]>;
  /** Replace the whole ordered list in ONE transaction. */
  replaceAttachments(agentId: string, repoId: string, paths: string[]): Promise<void>;
  /** path → number of the workspace's agents that attached it for this repo. */
  attachedAgentCounts(workspaceId: string, repoId: string): Promise<Map<string, number>>;
  /**
   * Attachments of the workspace's ENABLED agents for the repo, in ONE query: agents ordered by
   * name (collate "C") then id, each agent's docs by position. Other workspaces' agents never appear.
   */
  listEnabledAgentAttachments(workspaceId: string, repoId: string): Promise<{ agentId: string; path: string }[]>;
}

export interface DevdigestDocRecord {
  id: string;
  repoId: string;
  path: string;
  content: string;
  copiedFrom: string | null;
  updatedAt: Date;
}

/** Storage for DevDigest-owned docs. Every method filters by workspaceId. */
export interface DevdigestDocsRepositoryPort {
  /** Ordered by path, collate "C". */
  listByRepo(workspaceId: string, repoId: string): Promise<DevdigestDocRecord[]>;
  getById(workspaceId: string, id: string): Promise<DevdigestDocRecord | undefined>;
  getByPaths(workspaceId: string, repoId: string, paths: readonly string[]): Promise<DevdigestDocRecord[]>;
  countByRepo(workspaceId: string, repoId: string): Promise<number>;
  /** undefined when (repo_id, path) already exists (on conflict do nothing). */
  insert(input: {
    workspaceId: string;
    repoId: string;
    path: string;
    content: string;
    copiedFrom: string | null;
  }): Promise<DevdigestDocRecord | undefined>;
  /** Bumps updated_at. */
  updateContent(workspaceId: string, id: string, content: string): Promise<DevdigestDocRecord | undefined>;
  /** ONE transaction: delete agent_context_docs rows (repo_id, path) + the doc. undefined when not found. */
  deleteAndDetach(
    workspaceId: string,
    id: string,
  ): Promise<{ repoId: string; path: string; detached: number } | undefined>;
  attachedAgents(workspaceId: string, repoId: string, path: string): Promise<{ id: string; name: string }[]>;
}
