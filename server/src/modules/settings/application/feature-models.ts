import {
  FEATURE_MODELS,
  type FeatureModelChoice,
  type FeatureModelId,
} from '@devdigest/shared';
import type { SettingsRepository } from '../domain/ports.js';

/**
 * Per-feature model configuration. System LLM features (onboarding, intent,
 * risk brief, conformance, conventions) read their provider/model from the
 * workspace's Settings; unset → the registry default in FEATURE_MODELS.
 */
const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/** Workspace override, else registry default. */
export async function resolveFeatureModel(
  settings: Pick<SettingsRepository, 'featureModelOverride'>,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  return (await settings.featureModelOverride(workspaceId, id)) ?? DEFAULTS[id];
}
