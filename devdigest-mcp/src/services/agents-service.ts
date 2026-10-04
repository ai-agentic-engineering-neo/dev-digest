// Ring 2. Depends on the DevDigestApi port only.
import type { DevDigestApi } from '../domain/ports.js';
import { toAgentSummary, type AgentSummary } from '../domain/trim.js';

export class AgentsService {
  constructor(private readonly api: DevDigestApi) {}

  async listAgents(): Promise<{ agents: AgentSummary[] }> {
    const agents = await this.api.listAgents();
    return { agents: agents.map(toAgentSummary) };
  }
}
