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
}
