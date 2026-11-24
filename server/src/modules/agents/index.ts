import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { AgentsService } from './application/agents.service.js';
import { registerAgentsRoutes } from './http/routes.js';

/**
 * Agents module factory — the only place in the module that wires concrete
 * dependencies. Repository and Unit of Work come from the composition root
 * (platform/container.ts), already typed as ports.
 */
export default async function agentsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new AgentsService({
    agents: c.agentsRepo,
    uow: c.agentsUow,
    modelsFor: (provider) => c.llm(provider),
  });
  await registerAgentsRoutes(app, { service, context: (req) => getContext(c, req) });
}
