import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * `ci` module — export-to-CI wizard endpoints (T5). Thin: validate → one
 * service call → reply. Same workspace-scoping/guard pattern as the agent
 * routes (`getContext` + `NotFoundError` on cross-workspace/missing agent,
 * thrown by `CiService`).
 *
 *   POST /agents/:id/export-ci        → CiExport (files, and a PR for GHA+open_pr)
 *   GET  /agents/:id/ci-installations → CiInstallation[]
 *   POST /ci/refresh                  → { degraded, message? } (T6 pull-based ingest)
 *   GET  /ci/runs                     → CiRun[]
 *
 * `POST /ci/refresh` and `GET /ci/runs` call only `CiService` methods — never
 * `modules/ci/ingest.ts` directly (that module is CiService's implementation
 * detail). There is intentionally no inbound push endpoint: CI results only
 * ever arrive by this server polling GitHub's Actions API.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.ciService;

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      return service.exportCi(workspaceId, req.params.id, {
        repo: body.repo,
        target: body.target,
        action: body.action,
        triggers: body.triggers,
        base: body.base,
        post_as: body.post_as,
        workflow_override: body.workflow_override,
      });
    },
  );

  app.get('/agents/:id/ci-installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listInstallations(workspaceId, req.params.id);
  });

  app.post('/ci/refresh', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId);
  });

  app.get('/ci/runs', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId);
  });
}
