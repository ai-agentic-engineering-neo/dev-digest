import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OVERRIDE_RATE_LIMIT, REFRESH_RATE_LIMIT } from './constants.js';
import { IntentOverrideBody, PrIntentOrNull, PrIntentResponse } from './schemas.js';

/**
 * Intent module — why a PR exists (derived once per head + inputs, user-editable).
 *   GET    /pulls/:id/intent           → stored intent or null (never derives)
 *   POST   /pulls/:id/intent/refresh   → re-derive now (a user override is kept); rate-limited
 *   PUT    /pulls/:id/intent           → save a user override; rate-limited
 *   DELETE /pulls/:id/intent           → drop the override (null when nothing derived remains)
 * Every handler passes the workspace to the service, which 404s for another workspace's PR.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Shared instance from the container: the single-flight map must be the executor's too.
  const service = app.container.intent;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentOrNull } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent/refresh',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: REFRESH_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.params.id, req.log);
    },
  );

  app.put(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: IntentOverrideBody, response: { 200: PrIntentResponse } },
      config: { rateLimit: OVERRIDE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setOverride(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentOrNull } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.resetOverride(workspaceId, req.params.id);
    },
  );
}
