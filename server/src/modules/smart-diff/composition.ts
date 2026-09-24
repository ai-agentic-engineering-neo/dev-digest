import type { Container } from '../../platform/container.js';
import { SmartDiffService } from './application/smart-diff-service.js';
import { SmartDiffRepository } from './infrastructure/repository.js';

/**
 * Composition root of the smart-diff module (lazy: `Container.modules.smartDiff`).
 * No background jobs, no other module dependency — it only reads pr_files and
 * reviews/findings via its own repository (server/specs/06-smart-diff.md).
 */
export function buildSmartDiffModule(c: Container) {
  const repository = new SmartDiffRepository(c.db);
  const service = new SmartDiffService({ source: repository });
  return { service };
}
