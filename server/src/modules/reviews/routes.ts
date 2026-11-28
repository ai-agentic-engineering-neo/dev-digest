import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActiveRun,
  FindingActionResponse,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
  RunTrace,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkResponse } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { liveRunFrames, toSseFrame } from '../../platform/sse.js';
import { ReviewService } from './service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → run review(s); returns runs
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;

/**
 * Both fields of a run request are optional, and the client may send no body
 * at all (Fastify then hands the validator `null`/`undefined`). Treat a missing
 * body as `{}` so the request reaches the use case instead of failing validation.
 */
const RunRequestBody = z.preprocess((body) => body ?? {}, RunRequest);
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService({
    store: container.reviewRepo,
    pulls: container.pullStore,
    repos: container.repoStore,
    agents: container.agentsRepo,
    llm: (provider) => container.llm(provider),
    git: container.git,
    parseDiff: container.parseDiff,
    repoIntel: container.repoIntel,
    events: container.runBus,
  });

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  app.post(
    '/pulls/:id/review',
    {
      schema: { params: IdParams, body: RunRequestBody, response: { 200: ReviewRunResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = req.body;
    const targets = await service.resolveTargets(workspaceId, {
      ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
      ...(body.all !== undefined ? { all: body.all } : {}),
    });
    const { runs, reviews } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews };
  });

  // ---- SSE: run events (replay first, then live; ends on done) -----------
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  // The run is resolved before `reply.sse` hijacks the reply, so an unknown
  // run is an ordinary 404 envelope. A finished run replays its stored log and
  // ends, exactly as the live stream ended. The client leaving aborts the live
  // stream, which drops its bus subscription and heartbeat at once.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const runId = req.params.id;
    const source = await service.runEventSource(workspaceId, runId);

    if (source.kind === 'replay') {
      reply.sse(
        (async function* () {
          for (const e of source.events) yield toSseFrame(e);
        })(),
      );
      return;
    }

    const disconnected = new AbortController();
    reply.raw.once('close', () => disconnected.abort());
    reply.sse(liveRunFrames(container.runBus, runId, disconnected.signal));
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get(
    '/pulls/:id/runs/active',
    { schema: { params: IdParams, response: { 200: z.array(ActiveRun) } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  },
  );

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get(
    '/pulls/:id/runs',
    { schema: { params: IdParams, response: { 200: z.array(RunSummary) } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  },
  );

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams, response: { 200: RunTrace } } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get(
    '/pulls/:id/reviews',
    { schema: { params: IdParams, response: { 200: z.array(ReviewRecord) } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  },
  );

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(
      `/findings/:id/${action}`,
      { schema: { params: IdParams, response: { 200: FindingActionResponse } } },
      async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
      },
    );
  }
}
