import type { FeatureModelChoice, FeatureModelId } from '@devdigest/shared';
import type { FeatureModelDefaults } from '../domain/policies.js';
import type { SettingsRepository } from '../domain/ports.js';

/**
 * Per-feature model configuration. System LLM features (onboarding, intent,
 * risk brief, conformance, conventions) read their provider/model from the
 * workspace's Settings; unset → the registry default. The defaults come in as
 * a dependency, built at the composition root with
 * `featureModelDefaults(FEATURE_MODELS)` (domain/policies.ts).
 */
export interface FeatureModelDeps {
  settings: Pick<SettingsRepository, 'featureModelOverride'>;
  defaults: FeatureModelDefaults;
}

/** Workspace override, else registry default. */
export async function resolveFeatureModel(
  { settings, defaults }: FeatureModelDeps,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  return (await settings.featureModelOverride(workspaceId, id)) ?? defaults[id];
}
