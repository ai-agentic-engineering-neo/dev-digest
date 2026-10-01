// Ring 1. Pure, hand-written output trimming. Fields are picked explicitly
// (allowlist) so a new server-side field can never leak through, and an agent's
// system_prompt is never returned.
import type { Agent } from '@devdigest/shared';

export interface AgentSummary {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export function toAgentSummary(agent: Agent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    enabled: agent.enabled,
  };
}
