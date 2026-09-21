import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionSkillBody, UpdateConventionBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildConventionsService } from './wiring.js';

/**
 * Conventions extractor: scan a repo for its house rules, triage them, turn the
 * accepted ones into the `repo-conventions` skill.
 *
 *   POST  /repos/:id/conventions/extract     -> Run Scan / ReScan (sample -> model -> evidence gate)
 *   GET   /repos/:id/conventions             -> persisted candidates (pending + accepted)
 *   PATCH /conventions/:id                   -> accept / reject / edit
 *   GET   /repos/:id/conventions/skill-draft -> un-persisted skill draft from ACCEPTED rows
 *   POST  /repos/:id/conventions/skill       -> upsert `repo-conventions` + link to an agent
 *
 * The scan is a POST because it costs a model call; the rest is CRUD over the
 * candidates the scan produced.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildConventionsService(app.container, app.log);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.createSkill(workspaceId, req.params.id, req.body);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );
}
