import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
  type Settings,
} from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/** Collapse key/value setting rows into a flat `Settings` object. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

/*
 * Per-feature model configuration. System LLM features (onboarding, intent,
 * risk brief, conformance, conventions) read their provider/model from the
 * workspace's Settings; when unset they fall back to the registry default in
 * `FEATURE_MODELS`, which mirrors each module's old constant.
 */
const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/** The workspace's override for `id` in a settings bag, or `undefined` when unset/invalid. */
export function featureModelOverride(
  settings: Settings,
  id: FeatureModelId,
): FeatureModelChoice | undefined {
  const fm = (settings as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}
