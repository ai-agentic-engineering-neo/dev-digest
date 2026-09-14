import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * specs/11-why-risk-brief.md — PR Why + Risk Brief routes.
 *
 *   GET  /pulls/:id/brief            → BriefPage            (0 LLM calls: AC-23)
 *   POST /pulls/:id/brief/generate   → BriefGenerateResult
 *
 * One POST, not two routes — the spec's Flow diagram treats "Regenerate" as
 * the same action (AC-26), distinguished only by the `regenerate` body flag.
 * Both resolve `container.briefService`, which itself resolves the PR via a
 * workspace-scoped `BriefRepository.getPull` FIRST — a PR in another
 * workspace 404s before any `pr_brief` row is ever read (AC-44).
 */

const GenerateBriefBody = z.object({ regenerate: z.boolean().optional().default(false) });

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.briefService;

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const page = await service.getPage(workspaceId, req.params.id);
    if (!page) throw new NotFoundError('Pull request not found');
    return page;
  });

  app.post(
    '/pulls/:id/brief/generate',
    { schema: { params: IdParams, body: GenerateBriefBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.body.regenerate);
    },
  );
}
