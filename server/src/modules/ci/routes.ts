import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput, CiTarget } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * specs/14-export-to-ci.md (P3/P4) — `getContext` first on every route
 * (workspace scoping, AC-24), schema-first zod `params`/`body`/`querystring`
 * (`server/CLAUDE.md`), routes declared with full paths (no prefix), matching
 * every other module.
 */

const SecretsQuery = z.object({ repo: z.string().min(1) });
const RefreshBody = z.object({ force: z.boolean().default(false) });
const RunsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  agent_id: z.string().uuid().optional(),
  repo: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});
// P-4 — the same generation inputs `CiExportInput` carries, flattened onto a
// querystring (GET, so the preview step's file click can be a simple fetch);
// `triggers` arrives comma-joined since Fastify's querystring parsing here
// doesn't repeat-key an array by default.
const PreviewFileQuery = z.object({
  repo: z.string().min(1),
  target: CiTarget.default('gha'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.string().default('opened,synchronize'),
  path: z.string().min(1),
});
const PerfQuery = z.object({
  range_days: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v), {
    message: 'range_days must be 7, 30 or 90',
  }).default(30),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.ciService;

  // ---- Target registry (D13/AC-2/AC-2a) ------------------------------------
  app.get('/ci/targets', async () => service.listTargets());

  // ---- Export wizard (P3: AC-1…AC-10a, AC-59, AC-64) -----------------------
  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  // P-4 — one bundle file's real contents, on demand (the main preview
  // response nulls the runner-bundle files' contents to avoid re-sending a
  // ~1.6 MB build artifact on every Configure-step change).
  app.get(
    '/agents/:id/ci/preview/file',
    { schema: { params: IdParams, querystring: PreviewFileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { path, triggers, ...rest } = req.query;
      return service.previewFile(
        workspaceId,
        req.params.id,
        { ...rest, action: 'files', base: 'main', triggers: triggers.split(',').filter(Boolean) },
        path,
      );
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // AC-7 — 201 for a genuinely new installation, 200 for a republish;
      // the body shape is identical, only the status differs.
      const { result, status } = await service.exportWithStatus(workspaceId, req.params.id, req.body);
      reply.code(status);
      return result;
    },
  );

  app.post(
    '/agents/:id/export-ci/archive',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const zipBytes = await service.exportArchive(workspaceId, req.params.id, req.body);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', 'attachment; filename="devdigest-ci.zip"');
      return reply.send(Buffer.from(zipBytes));
    },
  );

  app.get('/agents/:id/ci/installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listInstallationsForAgent(workspaceId, req.params.id);
  });

  app.get(
    '/agents/:id/ci/secrets',
    { schema: { params: IdParams, querystring: SecretsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.secretStatus(workspaceId, req.query.repo);
    },
  );

  app.post('/ci/installations/:id/republish', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.republish(workspaceId, req.params.id);
  });

  // ---- Ingestion + read surfaces (P4: AC-17…AC-32) -------------------------
  app.post('/ci/refresh', { schema: { body: RefreshBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.refresh(workspaceId, req.body.force);
  });

  app.get('/ci/runs', { schema: { querystring: RunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, {
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
      agentId: req.query.agent_id,
      repo: req.query.repo,
      status: req.query.status,
      source: req.query.source,
    });
  });

  // Fastify's static-over-param route precedence keeps this safe next to the
  // agents module's own `/agents/:id` (`modules/agents/routes.ts`).
  app.get('/agents/performance', { schema: { querystring: PerfQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.agentPerformance(workspaceId, req.query.range_days);
  });
}
