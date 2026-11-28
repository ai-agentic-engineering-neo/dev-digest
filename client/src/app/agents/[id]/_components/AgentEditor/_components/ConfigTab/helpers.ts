import type { Agent } from "@devdigest/shared";

/** The agent fields the Config tab edits. */
export type AgentDraft = Pick<
  Agent,
  "name" | "description" | "provider" | "model" | "system_prompt" | "strategy" | "ci_fail_on" | "repo_intel" | "enabled"
>;

/** The edits made so far; a field absent here still follows the agent. */
export type AgentEdits = Partial<AgentDraft>;

/** Only the edited fields whose value really differs from the agent's. */
export function changedFields(agent: AgentDraft, edits: AgentEdits): AgentEdits {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(edits) as (keyof AgentDraft)[]) {
    if (edits[key] !== agent[key]) changed[key] = edits[key];
  }
  return changed as AgentEdits;
}
