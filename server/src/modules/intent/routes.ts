import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Intent module (server/specs/intent.md).
 *   GET  /pulls/:id/intent            -> the stored PrIntentRecord, or null when none was derived yet
 *   POST /pulls/:id/intent/recompute  -> derive again now (bypasses the head_sha cache), returns the record
 * The derivation itself also runs, non-fatally, inside every review run.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  /** Adapt the request logger to the service's content-free log sink. */
  const logOf = (req: FastifyRequest) => ({
    info: (msg: string, data?: unknown) => req.log.info({ intent: data }, msg),
  });

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const record = await container.intent.get(workspaceId, req.params.id);
    // A bare `null` return is an empty body in Fastify; send the JSON literal instead.
    if (record === null) return reply.type('application/json').send('null');
    return record;
  });

  // Tight per-route limit: each call is a paid LLM request plus outbound fetches.
  app.post(
    '/pulls/:id/intent/recompute',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      // The prompt.assembled record goes to the request logger with the ids that tie it to this call.
      return container.intent.recompute(workspaceId, req.params.id, logOf(req), {
        logger: req.log,
        correlation: { request_id: req.id, pr_id: req.params.id },
      });
    },
  );
}
