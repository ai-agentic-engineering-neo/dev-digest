import type { Container } from '../../platform/container.js';
import { PollingRepository } from './repository.js';
import { PollingService } from './service.js';

/**
 * Composition root of the polling module (lazy: `Container.modules.polling`).
 * The PR import itself is the pulls module's use case (one multi-row upsert),
 * wired here as a port so polling never touches pulls' internals.
 */
export function buildPollingModule(c: Container) {
  return {
    service: new PollingService({
      polling: new PollingRepository(c.db),
      github: () => c.github(),
      importPulls: (workspaceId, repoId, listed) =>
        c.modules.pulls.service.importListed(workspaceId, repoId, listed),
    }),
  };
}
