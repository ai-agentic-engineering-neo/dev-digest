import type { Container } from '../../platform/container.js';
import { SettingsRepository } from './repository.js';
import { SettingsService } from './service.js';

/**
 * Composition root of the settings module (lazy: `Container.modules.settings`).
 * Other modules resolve per-feature models via
 * `c.modules.settings.service.resolveFeatureModel(workspaceId, id)`.
 */
export function buildSettingsModule(c: Container) {
  return {
    service: new SettingsService({
      settings: new SettingsRepository(c.db),
      secrets: c.secrets,
      github: () => c.github(),
      llm: (provider) => c.llm(provider),
      invalidateSecretCaches: () => c.invalidateSecretCaches(),
    }),
  };
}
