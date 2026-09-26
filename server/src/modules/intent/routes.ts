import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeriveIntentRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * L03 — intent module (ring ④). The only file here that imports fastify.
 *
 *   GET  /pulls/:id/intent  → the persisted intent for a PR (or null), with `stale`.
 *   POST /pulls/:id/intent  {force}  → derive (or return cached) intent; one model call.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const intent = await container.intent.get(workspaceId, req.params.id);
    return { intent };
  });

  // Synchronous on purpose (one model call, the client shows a pending
  // button) — same shape as conventions/extract. Tight per-route limit:
  // each call can trigger an expensive LLM classification.
  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: DeriveIntentRequest },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { record, cached } = await container.intent.derive(workspaceId, req.params.id, {
        force: req.body.force,
        budget: 'on-demand',
        logger: req.log,
      });
      return { intent: record, cached };
    },
  );
}
