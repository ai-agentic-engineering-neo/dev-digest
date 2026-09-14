import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RunRequest } from '@devdigest/shared';
import type { RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService } from './service.js';
import { ReviewRunExecutor } from './run-executor.js';
import { loadDiff } from './diff-loader.js';
import { AdhocReviewService } from './adhoc.js';
import { MultiAgentService } from './multi-agent.js';

/** `POST /reviews/adhoc` request body — local to this route (specs/08-pre-push-cli.md
 *  Decision "Where does the request/response contract live?"): NOT in
 *  `vendor/shared/contracts/` — nothing in `client/` consumes it, and this
 *  mirrors `CreateAgentBody` (`agents/routes.ts:34`). */
const AdhocReviewBody = z.object({
  agent_id: z.string().uuid(),
  diff: z.string().min(1),
});

/** 5 MB — a working-tree diff can exceed the app-wide 1 MB `bodyLimit`
 *  (`app.ts`'s `bodyLimit: 1_048_576`); the CLI enforces a matching
 *  pre-flight cap before it ever sends the request. */
const ADHOC_REVIEW_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * `POST /pulls/:id/multi-agent-run` body — specs/13-multi-agent-review.md
 * (D3): the shared `RunRequest.agentIds` field, but REQUIRED and non-empty
 * here (the base contract keeps it `.optional()` since `agentId`/`all` are
 * still valid on the existing single-agent trigger route above). A real zod
 * body schema (`server/CLAUDE.md:12-14`) — this route does NOT copy the
 * existing trigger's tolerant manual parse.
 */
const MultiAgentRunBody = z.object({ agentIds: z.array(z.string().uuid()).min(1) });

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → run review(s); returns runs
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   GET    /pulls/:id/smart-diff                       → files grouped by risk (no LLM call)
 *   POST   /pulls/:id/intent/recalculate                → manual, on-demand intent recompute
 *   POST   /reviews/adhoc                               → SYNCHRONOUS, non-persisting review of
 *                                                          a raw diff (specs/08-pre-push-cli.md) —
 *                                                          no run row, no SSE, nothing written to
 *                                                          the DB. The deliberate opposite of
 *                                                          `POST /pulls/:id/review`.
 *   POST   /findings/:id/(accept|dismiss|learn)        → finding actions
 *   POST   /pulls/:id/multi-agent-run  {agentIds}       → trigger a multi-agent run (specs/13)
 *   GET    /pulls/:id/multi-agent                       → latest multi-agent run for a PR
 *   GET    /multi-agent/estimates                       → per-agent historical duration/cost
 */
const FINDING_ACTIONS = ['accept', 'dismiss', 'learn'] as const;
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Composition point: the route ring is the only ring allowed to know concrete
  // classes. ReviewService itself declares its collaborators and never imports
  // the container, so reviews/service.ts stays free of infrastructure.
  const service = new ReviewService(
    container.reviewRepo,
    container.agentsRepo,
    new ReviewRunExecutor(container, container.reviewRepo, container.agentsRepo),
    container.runBus,
    (workspaceId, pull, repo) => loadDiff(container, container.reviewRepo, workspaceId, pull, repo),
    (input) => container.intentService.resolve(input),
  );
  // AdhocReviewService declares its own narrow `AgentLookup`/`SkillLookup`/
  // `ProjectContextResolver` ports — `container.agentsRepo` satisfies the
  // first two structurally (getById + enabledSkills), so it's passed twice
  // with no adapter class in between; `container.projectContextService`
  // satisfies `ProjectContextResolver` (specs/09-project-context-folder.md).
  const adhocService = new AdhocReviewService(
    container.agentsRepo,
    container.agentsRepo,
    (provider) => container.llm(provider),
    container.projectContextService,
  );
  // specs/13-multi-agent-review.md (D-P4) — lives inside modules/reviews/,
  // composed here beside ReviewService/AdhocReviewService. Reuses the SAME
  // `service.runReview` (one agent_runs row per target, fire-and-forget
  // execution) rather than a second trigger path.
  const multiAgentService = new MultiAgentService(container.reviewRepo, container.agentsRepo, service);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // Body stays a tolerant manual parse (both fields optional; empty body is OK).
  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = RunRequest.parse(req.body ?? {});
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

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    await getContext(container, req);
    const runId = req.params.id;

    reply.sse(
      (async function* () {
        // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
        const queue: RunEvent[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        const unsubscribe = container.runBus.subscribe(runId, (e) => {
          queue.push(e);
          resolve?.();
        });
        const offDone = container.runBus.onDone(runId, () => {
          done = true;
          resolve?.();
        });

        try {
          while (true) {
            if (queue.length === 0) {
              if (done) break;
              await new Promise<void>((r) => (resolve = r));
              resolve = null;
              continue;
            }
            const e = queue.shift()!;
            yield {
              id: String(e.seq),
              event: e.kind,
              data: JSON.stringify(e),
            };
          }
        } finally {
          unsubscribe();
          offDone();
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Smart Diff: files grouped by risk, merged with latest findings -----
  // Deterministic — no LLM call.
  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.smartDiff(workspaceId, req.params.id);
  });

  // ---- L03 — manual, on-demand intent recompute (bypasses waiting for a full
  // review run). Same LLM cost class as running a review, so rate-limited the
  // same way `/pulls/:id/review` is above.
  app.post(
    '/pulls/:id/intent/recalculate',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.recalculateIntent(workspaceId, req.params.id, req.log);
    },
  );

  // ---- specs/13-multi-agent-review.md — trigger a multi-agent run --------
  // Rate-limited per-route, matching the single-agent trigger above (finding
  // 10: `@fastify/rate-limit` keys per-IP by default; in this single-
  // workspace local app that coincides with per-workspace, so no custom
  // `keyGenerator` is added).
  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: MultiAgentRunBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiAgentService.trigger(workspaceId, req.params.id, req.body.agentIds, req.log);
    },
  );

  // ---- specs/13-multi-agent-review.md — the latest grouping for a PR -----
  app.get('/pulls/:id/multi-agent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const run = await multiAgentService.latest(workspaceId, req.params.id);
    if (!run) throw new NotFoundError('No multi-agent run for this pull request');
    return run;
  });

  // ---- specs/13-multi-agent-review.md — per-agent historical estimates ---
  // Deliberately NOT under /agents/ (finding 11): the agents module doesn't
  // own agent_runs, and /agents/run-estimates would sit next to /agents/:id.
  app.get('/multi-agent/estimates', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return multiAgentService.estimates(workspaceId);
  });

  // ---- specs/08-pre-push-cli.md — ad-hoc (pre-push) review of a raw diff --
  // SYNCHRONOUS: the finished review comes back in this response body, unlike
  // `POST /pulls/:id/review` above (fire-and-forget + SSE). Nothing is
  // persisted — no agent_runs row, no reviews/findings rows, `runBus` is
  // never touched. Rate-limited the same as `/pulls/:id/review` (also an LLM
  // call); `bodyLimit` overrides `app.ts`'s app-wide 1 MB cap because a
  // working-tree diff can exceed that.
  app.post(
    '/reviews/adhoc',
    {
      schema: { body: AdhocReviewBody },
      bodyLimit: ADHOC_REVIEW_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await adhocService.review({
        workspaceId,
        agentId: req.body.agent_id,
        diff: req.body.diff,
      });
      return result;
    },
  );

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss / learn) -------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(`/findings/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
    });
  }
}
