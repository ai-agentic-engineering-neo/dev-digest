import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCandidate,
  ConventionList,
  ConventionPatch,
  ConventionSkillInput,
  Skill,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const ConventionParams = z.object({ id: z.string().uuid(), conventionId: z.string().uuid() });

/**
 * M2 — Conventions Extractor.
 *   GET   /repos/:id/conventions                  → candidates + last scan
 *   POST  /repos/:id/conventions/extract          → run one extraction (one LLM call)
 *   PATCH /repos/:id/conventions/:conventionId    → accept / reject / edit rule
 *   POST  /repos/:id/conventions/skill            → save accepted ones as a skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.conventionsService;

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionParams, body: ConventionPatch, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.patch(workspaceId, req.params.id, req.params.conventionId, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionSkillInput, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.code(201);
      return skill;
    },
  );
}
