import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WorkspaceInfo } from '@devdigest/shared';
import type { RequestContext } from '../../_shared/context.js';
import type { WorkspaceService } from '../application/workspace.service.js';
import { presentWorkspace } from './presenter.js';

export interface WorkspaceRouteDeps {
  service: WorkspaceService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * F1 — workspace overview.
 *   GET /workspace → workspace info + cloneDir + cloned repos summary
 * Cleanup/re-pull of individual repos lives in the repos module.
 */
export async function registerWorkspaceRoutes(
  appBase: FastifyInstance,
  { service, context }: WorkspaceRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/workspace', { schema: { response: { 200: WorkspaceInfo } } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentWorkspace(await service.overview(workspaceId));
  });
}
