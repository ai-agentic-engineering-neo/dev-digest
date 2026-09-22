import type { Container } from '../../platform/container.js';
import { ReviewService } from './application/review-service.js';
import { ReviewRunExecutor } from './application/run-executor.js';
import { ReviewRepository } from './repository.js';

/**
 * Composition root of the reviews module (lazy: `Container.modules.reviews`).
 * Adapters are resolved per call (`c.git`, `c.repoIntel`, `c.llm`) so test
 * overrides and secret rotation keep working.
 */
export function buildReviewsModule(c: Container) {
  const reviews = new ReviewRepository(c.db);
  const clock = () => new Date();
  const executor = new ReviewRunExecutor({
    reviews,
    tx: c.transactionRunner((db) => ({ reviews: new ReviewRepository(db) })),
    runBus: c.runBus,
    llm: (provider) => c.llm(provider),
    git: { diff: (repo, base, head) => c.git.diff(repo, base, head) },
    repoIntel: {
      getCallerSignatures: (repoId, files, limit) => c.repoIntel.getCallerSignatures(repoId, files, limit),
      getRepoMap: (repoId, budget) => c.repoIntel.getRepoMap(repoId, budget),
      getFileRank: (repoId, paths) => c.repoIntel.getFileRank(repoId, paths),
    },
    clock,
    ...(c.config.reviewMapConcurrency !== undefined ? { mapConcurrency: c.config.reviewMapConcurrency } : {}),
  });
  return {
    service: new ReviewService({ reviews, agents: c.agentsRepo, runBus: c.runBus, executor, clock }),
  };
}
