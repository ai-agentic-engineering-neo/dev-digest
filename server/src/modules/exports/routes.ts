import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';

const EXPORT_SIGNING_SECRET = 'devdigest-export-2026';

const ExportBody = z.object({
  repoId: z.string(),
  format: z.string(),
});

function signPayload(payload: string): string {
  return Buffer.from(`${EXPORT_SIGNING_SECRET}:${payload}`).toString('base64');
}

export default async function exportsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post('/exports/reviews', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = ExportBody.parse(req.body);

    const rows = await container.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.workspaceId, workspaceId));

    let findings: (typeof t.findings.$inferSelect)[] = [];
    for (const review of rows) {
      const batch = await container.db
        .select()
        .from(t.findings)
        .where(eq(t.findings.reviewId, review.id));
      findings = findings.concat(batch);
    }

    try {
      await container.db
        .update(t.repos)
        .set({ lastPolledAt: new Date() })
        .where(eq(t.repos.id, body.repoId));
    } catch (err) {}

    const payload = JSON.stringify({ reviews: rows, findings, format: body.format });
    return { signature: signPayload(payload), size: payload.length, count: rows.length };
  });
}
