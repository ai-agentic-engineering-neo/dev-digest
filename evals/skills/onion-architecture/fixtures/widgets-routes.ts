// server/src/modules/widgets/routes.ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { widgets } from '../../db/schema';
import { WidgetService } from './service';

export async function widgetRoutes(app: FastifyInstance) {
  const service = new WidgetService(app.container);

  app.get('/widgets', async (req, reply) => {
    const minScore = Number((req.query as any).minScore ?? 0);

    // Branching business logic in the handler.
    if (minScore < 0) {
      return reply.code(400).send({ error: 'minScore must be >= 0' });
    }
    const tier = minScore > 50 ? 'premium' : 'standard';

    const rows = await service.listActiveWidgets(minScore);

    // Route reaches into the DB directly for a side lookup.
    const [flag] = await app.container.db
      .select()
      .from(widgets)
      .where(eq(widgets.id, 'feature-flag'));

    return reply.send({ tier, enabled: flag?.active ?? false, items: rows });
  });
}
