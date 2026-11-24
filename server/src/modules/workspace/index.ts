import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceService } from './application/workspace.service.js';
import { registerWorkspaceRoutes } from './http/routes.js';
import { DrizzleWorkspaceRepository } from './infrastructure/workspace.repository.js';

/** Workspace module factory — wires the Drizzle read model and config. */
export default async function workspaceModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new WorkspaceService({
    repos: new DrizzleWorkspaceRepository(c.db),
    cloneDir: c.config.cloneDir,
  });
  await registerWorkspaceRoutes(app, { service, context: (req) => getContext(c, req) });
}
