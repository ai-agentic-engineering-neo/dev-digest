import type { Container } from '../../platform/container.js';
import { AgentsService } from './service.js';

/**
 * Composition root of the agents module — the ONE place that builds its
 * services. Called lazily by `Container.modules.agents`. The repository is the
 * container's shared `agentsRepo` (other modules read agents through it too).
 */
export function buildAgentsModule(c: Container) {
  return {
    service: new AgentsService({ agents: c.agentsRepo, llm: (provider) => c.llm(provider) }),
  };
}
