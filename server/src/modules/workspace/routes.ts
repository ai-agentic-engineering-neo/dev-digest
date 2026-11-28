import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceService } from './service.js';

/**
 * F1 — workspace manager. Transport layer only.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 */
export default async function workspaceRoutes(app: FastifyInstance) {
  const service = new WorkspaceService({
    repos: app.container.repoStore,
    cloneDir: app.container.config.cloneDir,
  });

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });
}
