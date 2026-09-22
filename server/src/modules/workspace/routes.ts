import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';

const WorkspaceResponse = z.object({
  workspaceId: z.string(),
  cloneDir: z.string(),
  repos: z.array(
    z.object({
      id: z.string(),
      full_name: z.string(),
      clone_path: z.string().nullable(),
      last_polled_at: z.string().nullable(),
      cloned: z.boolean(),
    }),
  ),
});

/**
 * F1 — workspace module (http).
 *   GET /workspace → workspace info + cloneDir + cloned repos summary
 */
export default async function workspaceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/workspace', { schema: { response: { 200: WorkspaceResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return container.modules.workspace.service.overview(workspaceId);
  });
}
