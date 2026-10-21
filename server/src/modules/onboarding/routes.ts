/**
 * onboarding — HTTP driving adapter (ring 3b).
 *
 *   GET  /repos/:id/onboarding           → { tour, run, stale } (DB only)
 *   POST /repos/:id/onboarding/generate  → start a run (202 with the running run)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new OnboardingService({
    repo: c.onboardingRepo,
    repos: c.reposRepo,
    repoIntel: c.repoIntel,
    repoIntelEnabled: c.config.repoIntelEnabled,
    git: c.git,
    llm: (provider) => c.llm(provider),
    featureModel: (workspaceId) => c.featureModel(workspaceId, 'onboarding'),
    jobs: c.jobs,
    systemPrompt: () => loadPromptTemplate('onboarding.system.md'),
    log: (msg, data) => app.log.info(data ?? {}, msg),
  });

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.view(workspaceId, req.params.id);
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(c, req);
    const run = await service.generate(workspaceId, req.params.id);
    reply.code(202);
    return { run };
  });
}
