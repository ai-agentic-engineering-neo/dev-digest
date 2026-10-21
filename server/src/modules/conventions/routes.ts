/**
 * conventions — HTTP driving adapter (ring 3b).
 *
 *   GET  /repos/:id/conventions              → latest scan + candidates
 *   POST /repos/:id/conventions/extract      → start a scan (202 with the running scan)
 *   PUT  /conventions/:id                    → accept / reject / edit a candidate
 *   POST /repos/:id/conventions/deselect     → every accepted candidate back to candidate
 *   GET  /repos/:id/conventions/skill-draft  → the `repo-conventions` skill the accepted rows would become
 *   POST /repos/:id/conventions/skill        → save the (edited) draft as a skill and link it to an agent
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillBodySchema, SkillNameSchema } from '../_shared/skill-limits.js';
import { ConventionsService } from './service.js';

const CandidatePatchBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(1).max(500).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined || b.category !== undefined, {
    message: 'Provide status, rule or category',
  });

const CreateSkillBody = z.object({
  name: SkillNameSchema,
  description: z.string().default(''),
  type: SkillType,
  body: SkillBodySchema,
  enabled: z.boolean().optional(),
  agent_id: z.string().uuid(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  // Composition: every dependency is a port implemented by the container's
  // adapters/repositories or by a sibling module's service exposed on it.
  const service = new ConventionsService({
    repo: c.conventionsRepo,
    repos: c.reposRepo,
    repoIntel: c.repoIntel,
    git: c.git,
    llm: (provider) => c.llm(provider),
    featureModel: (workspaceId) => c.featureModel(workspaceId, 'conventions'),
    jobs: c.jobs,
    skills: c.skillsService,
    agents: c.agentsService,
    log: (msg, data) => app.log.info(data ?? {}, msg),
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.view(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(c, req);
    const scan = await service.extract(workspaceId, req.params.id);
    reply.code(202);
    return { scan };
  });

  app.put('/conventions/:id', { schema: { params: IdParams, body: CandidatePatchBody } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.decide(workspaceId, req.params.id, req.body);
  });

  app.post('/repos/:id/conventions/deselect', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.deselectAll(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams, body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(c, req);
    reply.code(201);
    return service.createSkill(workspaceId, req.params.id, req.body);
  });
}
