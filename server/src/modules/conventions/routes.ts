import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract house rules from a repo, judge them, ship them
 * as a skill.
 *
 *   POST /repos/:id/conventions/extract        → 202 { scan_id }; runs as a job
 *   GET  /repos/:id/conventions                → { scan, candidates }
 *   PATCH /conventions/:id                     → accept / reject / inline edit
 *   POST /repos/:id/conventions/skill/preview  → the skill body, persisting nothing
 *   POST /repos/:id/conventions/skill          → create the skill (+ optional agent link)
 *
 * The job handler is registered here, at module load, so a scan enqueued by a
 * request always has a handler to run against — the same shape as `repo-intel`.
 */

const CandidateIds = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1),
});

const UpdateCandidateBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(1).max(500).optional(),
    category: ConventionCategory.optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

const CreateSkillBody = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  type: SkillType.default('convention'),
  body: z.string().min(1),
  enabled: z.boolean().default(true),
  agent_id: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);
  service.registerJobHandler();

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.startScan(workspaceId, req.params.id);
      reply.status(202);
      return result;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.page(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateCandidateBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCandidate(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill/preview',
    { schema: { params: IdParams, body: CandidateIds } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      // Deliberately NOT persisted: this is the step that makes "edit before you
      // save" true rather than a claim in the modal's copy.
      return service.previewSkill(workspaceId, req.params.id, req.body.candidate_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, {
        candidateIds: req.body.candidate_ids,
        name: req.body.name,
        description: req.body.description,
        type: req.body.type,
        body: req.body.body,
        enabled: req.body.enabled,
        ...(req.body.agent_id !== undefined ? { agentId: req.body.agent_id } : {}),
      });
      reply.status(201);
      return skill;
    },
  );
}
