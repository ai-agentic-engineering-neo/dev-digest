import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { count, eq } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { agents } from '../../db/schema.js';

/**
 * GET /agents/summary → how many agents are enabled / disabled.
 *
 * Demo fixture for verifying that a reviewer cites an attached architecture
 * document: this route reads the database itself instead of going through
 * AgentsService / the agents repository.
 */
export async function agentSummaryRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { db } = createDb(process.env.DATABASE_URL ?? '');

  typed.get(
    '/agents/summary',
    { schema: { response: { 200: z.object({ enabled: z.number(), disabled: z.number() }) } } },
    async () => {
      const [on] = await db.select({ n: count() }).from(agents).where(eq(agents.enabled, true));
      const [off] = await db.select({ n: count() }).from(agents).where(eq(agents.enabled, false));
      return { enabled: on?.n ?? 0, disabled: off?.n ?? 0 };
    },
  );
}
