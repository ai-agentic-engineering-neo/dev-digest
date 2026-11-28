import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WorkspaceOverview } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { WorkspaceService } from './service.js';

/**
 * F1 — workspace manager. Transport layer only.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 */
export default async function workspaceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new WorkspaceService({
    repos: app.container.repoStore,
    cloneDir: app.container.config.cloneDir,
  });

  app.get('/workspace', { schema: { response: { 200: WorkspaceOverview } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });
}
