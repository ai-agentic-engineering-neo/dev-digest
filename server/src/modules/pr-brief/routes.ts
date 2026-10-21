/**
 * pr-brief — HTTP driving adapter (ring 3b).
 *
 *   GET  /pulls/:id/brief           → PrBriefView (DB only)
 *   POST /pulls/:id/brief/generate  → start a run (202 with the running run)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { RunLogger } from '../../platform/run-logger.js';
import { z } from 'zod';
import { PrBriefView, RunSummary } from '@devdigest/shared';
import { RATE_LIMIT } from './constants.js';
import { PrBriefService } from './service.js';

export default async function prBriefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new PrBriefService({
    repo: c.prBriefRepo,
    intent: c.intentRepo,
    smartDiff: c.smartDiffService,
    blast: c.blastService,
    repoIntelEnabled: c.config.repoIntelEnabled,
    llm: (provider) => c.llm(provider),
    featureModel: (workspaceId) => c.featureModel(workspaceId, 'risk_brief'),
    jobs: c.jobs,
    systemPrompt: () => loadPromptTemplate('pr-brief.system.md'),
    runLog: (runId, prId) => new RunLogger(c.runBus, [runId], app.log, { prId }),
  });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefView } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.view(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief/generate',
    { schema: { params: IdParams, response: { 202: z.object({ run: RunSummary }) } }, config: { rateLimit: RATE_LIMIT } },
    async (req, reply) => {
      const { workspaceId } = await getContext(c, req);
      const run = await service.generate(workspaceId, req.params.id);
      reply.code(202);
      return { run };
    },
  );
}
