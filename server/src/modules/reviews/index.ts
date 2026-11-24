import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { registerReviewsRoutes } from './http/routes.js';

/**
 * Reviews module factory. The service (and its background run executor) is
 * built once in the composition root — `container.reviewService` — so the boot
 * reaper in app.ts and the routes share it.
 */
export default async function reviewsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  await registerReviewsRoutes(app, {
    service: c.reviewService,
    runEvents: c.runBus,
    context: (req) => getContext(c, req),
  });
}
