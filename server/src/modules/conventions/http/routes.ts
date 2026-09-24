import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Convention,
  ConventionScan,
  ConventionsState,
  CreateConventionSkillInput,
  CreateConventionSkillResult,
  UpdateConventionInput,
} from '@devdigest/shared';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';

/**
 * Conventions module (server/specs/04-conventions.md, API table).
 *   GET   /repos/:id/conventions           → ConventionsState (latest scan + rules)
 *   POST  /repos/:id/conventions/extract   → 202 ConventionScan (runs in the background)
 *   PATCH /conventions/:id                 → Convention (accept / reject / edit)
 *   POST  /repos/:id/conventions/skill     → 201 CreateConventionSkillResult
 * A repo or rule from another workspace is a 404.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { service } = app.container.modules.conventions;

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionsState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.state(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 202: ConventionScan } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const scan = await service.extract(workspaceId, req.params.id);
      return reply.code(202).send(scan);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput, response: { 200: Convention } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillInput, response: { 201: CreateConventionSkillResult } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      return reply.code(201).send(result);
    },
  );
}
