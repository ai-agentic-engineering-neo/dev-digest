import { describe, it, expect } from 'vitest';
import { FEATURE_MODELS } from '@devdigest/shared';
import { featureModelDefaults } from '../src/modules/settings/domain/policies.js';
import { resolveFeatureModel } from '../src/modules/settings/application/feature-models.js';

describe('featureModelDefaults', () => {
  it('indexes every registry entry by id as provider + model', () => {
    const defaults = featureModelDefaults(FEATURE_MODELS);
    expect(Object.keys(defaults).sort()).toEqual(FEATURE_MODELS.map((f) => f.id).sort());
    for (const f of FEATURE_MODELS) {
      expect(defaults[f.id]).toEqual({ provider: f.defaultProvider, model: f.defaultModel });
    }
  });
});

describe('resolveFeatureModel', () => {
  const defaults = featureModelDefaults(FEATURE_MODELS);
  const onboarding = FEATURE_MODELS.find((f) => f.id === 'onboarding')!;

  it('returns the injected default when the workspace has no override', async () => {
    const settings = { featureModelOverride: async () => undefined };
    expect(await resolveFeatureModel({ settings, defaults }, 'w1', 'onboarding')).toEqual({
      provider: onboarding.defaultProvider,
      model: onboarding.defaultModel,
    });
  });

  it('prefers the workspace override', async () => {
    const choice = { provider: 'openrouter' as const, model: 'x/y' };
    const settings = { featureModelOverride: async () => choice };
    expect(await resolveFeatureModel({ settings, defaults }, 'w1', 'onboarding')).toEqual(choice);
  });
});
