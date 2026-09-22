import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  ActiveRunsResponse,
  FindingActionResponse,
  OkResponse,
  ReviewRunResponseSchema,
  ReviewsResponse,
  RunHistoryResponse,
  RunReviewBody,
  RunTraceResponse,
} from './http/schemas.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → start review run(s); returns the runs
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /pulls/:id/runs/active | /pulls/:id/runs    → in-flight runs | run history
 *   DELETE /runs/:id · POST /runs/:id/cancel           → delete / cancel a run
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews · DELETE /reviews/:id    → persisted reviews + findings
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;

export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.modules.reviews.service;

  // Tight per-route limit: each call can fan out to expensive LLM runs. An
  // empty body counts as {} (the service then answers 400 invalid_run_request).
  app.post(
    '/pulls/:id/review',
    {
      schema: { params: IdParams, body: RunReviewBody, response: { 200: ReviewRunResponseSchema } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { agentId, all } = req.body;
      return service.startReview(
        workspaceId,
        req.params.id,
        { ...(agentId !== undefined ? { agentId } : {}), ...(all !== undefined ? { all } : {}) },
        req.log,
      );
    },
  );

  // SSE: replay buffer first, then live; ends when the run is done. No
  // response schema (a stream) and no rate limit (one long-lived connection).
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const events = await service.runEvents(workspaceId, req.params.id);
      reply.sse(
        (async function* () {
          for await (const e of events) yield { id: String(e.seq), event: e.kind, data: JSON.stringify(e) };
        })(),
      );
    },
  );

  app.get(
    '/pulls/:id/runs/active',
    { schema: { params: IdParams, response: { 200: ActiveRunsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.activeRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/runs',
    { schema: { params: IdParams, response: { 200: RunHistoryResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.delete('/runs/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return { ok: await service.deleteRun(workspaceId, req.params.id) };
  });

  app.post('/runs/:id/cancel', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.cancelRun(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get(
    '/runs/:id/trace',
    { schema: { params: IdParams, response: { 200: RunTraceResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRunTrace(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/pulls/:id/reviews',
    { schema: { params: IdParams, response: { 200: ReviewsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.reviewsForPull(workspaceId, req.params.id);
    },
  );

  app.delete('/reviews/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteReview(workspaceId, req.params.id);
    return { ok: true };
  });

  for (const action of FINDING_ACTIONS) {
    app.post(
      `/findings/:id/${action}`,
      { schema: { params: IdParams, response: { 200: FindingActionResponse } } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        return service.actOnFinding(workspaceId, req.params.id, action);
      },
    );
  }
}
