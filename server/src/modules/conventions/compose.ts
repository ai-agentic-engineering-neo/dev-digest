import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsService } from './service.js';
import { ConventionsRepository } from './repository.js';
import type { Logger } from './ports.js';

export function createConventionsService(c: Container, logger?: Logger): ConventionsService {
  return new ConventionsService({
    store: new ConventionsRepository(c.db),
    samples: c.repoIntel,
    files: c.git,
    resolveModel: async (workspaceId) => {
      const choice = await resolveFeatureModel(c, workspaceId, 'conventions');
      return { llm: await c.llm(choice.provider), model: choice.model };
    },
    logger,
  });
}
