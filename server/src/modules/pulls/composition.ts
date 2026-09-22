import PQueue from 'p-queue';
import type { Container } from '../../platform/container.js';
import { BACKFILL_CONCURRENCY } from './constants.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * Composition root of the pulls module (lazy: `Container.modules.pulls`).
 * Routes read `app.container.modules.pulls.service`.
 */
export function buildPullsModule(c: Container) {
  return {
    service: new PullsService({
      pulls: new PullsRepository(c.db),
      github: () => c.github(),
      tx: c.transactionRunner((db) => ({ pulls: new PullsRepository(db) })),
      runBounded: (tasks) => new PQueue({ concurrency: BACKFILL_CONCURRENCY }).addAll(tasks),
    }),
  };
}
