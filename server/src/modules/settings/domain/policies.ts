import type { ConnTestProvider, FeatureModelChoice, FeatureModelId, Provider, SecretKey } from '@devdigest/shared';

/** Provider id handled by the GitHub branch of the connection test. */
export const GITHUB_PROVIDER = 'github';

/** Maps a connection-test provider to the secret key it persists to. */
export const SECRET_KEY_BY_PROVIDER: Record<ConnTestProvider, SecretKey> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  github: 'GITHUB_TOKEN',
};

/** Provider SDK errors can echo the key back — never return it. */
export function redactKey(message: string, key: string | undefined): string {
  return key ? message.split(key).join('[redacted]') : message;
}

/** A feature's registry default (the fields of FeatureModelDef that matter here). */
export interface FeatureModelDefault {
  id: FeatureModelId;
  defaultProvider: Provider;
  defaultModel: string;
}

/** Default provider+model per feature, keyed by feature id. */
export type FeatureModelDefaults = Readonly<Record<FeatureModelId, FeatureModelChoice>>;

/**
 * Index a feature registry by id. The registry itself (FEATURE_MODELS in
 * @devdigest/shared) is a runtime value, so the composition root passes it in;
 * the core only sees the resulting plain map.
 */
export function featureModelDefaults(registry: readonly FeatureModelDefault[]): FeatureModelDefaults {
  return Object.fromEntries(
    registry.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
  ) as Record<FeatureModelId, FeatureModelChoice>;
}
