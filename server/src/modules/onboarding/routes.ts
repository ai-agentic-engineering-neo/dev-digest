import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * specs/10-onboarding-generator.md — Onboarding Generator routes.
 *
 *   GET  /repos/:id/tour           → OnboardingPage   (0 LLM calls)
 *   POST /repos/:id/tour/generate  → OnboardingGenerateResult
 *
 * Both resolve the repo through `container.onboardingService`, which itself
 * resolves the repo via a workspace-scoped `RepoLookup.getById` FIRST — a
 * repo in another workspace 404s before any tour row is read (AC-49). There
 * is no third route: "Regenerate" is the same POST.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.onboardingService;

  app.get('/repos/:id/tour', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const page = await service.getPage(workspaceId, req.params.id);
    if (!page) throw new NotFoundError('Repo not found');
    return page;
  });

  app.post('/repos/:id/tour/generate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.generate(workspaceId, req.params.id);
  });
}
