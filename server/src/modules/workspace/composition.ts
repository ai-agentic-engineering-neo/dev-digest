import type { Container } from '../../platform/container.js';
import { WorkspaceRepository } from './repository.js';
import { WorkspaceService } from './service.js';

/** Composition root of the workspace module (lazy: `Container.modules.workspace`). */
export function buildWorkspaceModule(c: Container) {
  return {
    service: new WorkspaceService({
      workspace: new WorkspaceRepository(c.db),
      cloneDir: c.config.cloneDir,
    }),
  };
}
