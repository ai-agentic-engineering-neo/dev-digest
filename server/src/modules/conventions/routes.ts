import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionSkillDraftInput,
  CreateSkillFromConventionsInput,
  UpdateConventionInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { pickAvailableLLM, resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor (M2), all workspace-scoped:
 *   GET   /repos/:id/conventions              → ConventionsPage
 *   POST  /repos/:id/conventions/scan         → ConventionScanResult (one model call; 422 not cloned / not indexed)
 *   PATCH /conventions/:id                    → ConventionCandidate (accept / reject / edit)
 *   POST  /repos/:id/conventions/skill-draft  → ConventionSkillDraft (writes nothing)
 *   POST  /repos/:id/conventions/skill        → 201 ConventionSkillResult (409 name taken)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Module composition root: the service gets its ports explicitly.
  const service = new ConventionsService({
    store: new ConventionsRepository(container.db),
    sampler: container.repoIntel,
    clone: container.git,
    model: {
      // The workspace's choice, falling back to another provider with a key
      // (OpenRouter → OpenAI → Anthropic) instead of failing on a missing one.
      resolve: async (workspaceId) => {
        const chosen = await resolveFeatureModel(container, workspaceId, 'conventions');
        const { llm, choice } = await pickAvailableLLM(chosen, (p) => container.llm(p));
        return { llm, model: choice.model };
      },
    },
    skills: container.skillsRepo,
    tokens: container.tokenizer,
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/scan', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.scan(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionSkillDraftInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.draftSkill(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return result;
    },
  );
}
