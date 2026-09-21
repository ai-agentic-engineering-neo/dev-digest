import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { FEATURE_MODELS, type SecretsProvider } from '@devdigest/shared';
import {
  resolveFeatureModel,
  getFeatureModelOverride,
} from '../src/modules/settings/feature-models.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Settings: feature models + secrets status (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('resolveFeatureModel: registry default until overridden, then the workspace choice', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });

    // No override yet → registry default; getFeatureModelOverride is undefined.
    expect(await getFeatureModelOverride(app.container, workspaceId, 'onboarding')).toBeUndefined();
    expect(await resolveFeatureModel(app.container, workspaceId, 'onboarding')).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });

    // Persist an override through the normal PUT /settings path.
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { onboarding: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);

    expect(await resolveFeatureModel(app.container, workspaceId, 'onboarding')).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-4.7-flash',
    });
    // An unset feature still resolves to its own registry default.
    expect(await resolveFeatureModel(app.container, workspaceId, 'risk_brief')).toEqual({
      provider: 'openai',
      model: 'gpt-4.1',
    });

    await app.close();
  });

  it('conventions: dedicated registry row, resolves via the container to the workspace choice', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });

    // The Settings -> Models row is the registry entry with the sharpened copy.
    const def = FEATURE_MODELS.find((f) => f.id === 'conventions');
    expect(def).toMatchObject({
      label: 'Conventions classification',
      description: 'Classifies repository code-style conventions into candidate rules.',
    });

    // Until a model is picked, the container port yields the registry default...
    expect(await app.container.resolveFeatureModel(workspaceId, 'conventions')).toEqual({
      provider: def!.defaultProvider,
      model: def!.defaultModel,
    });

    // ...then the stored provider + model (what the UI writes after a pick), verbatim.
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'anthropic', model: 'claude-haiku-4-5' } } },
    });
    expect(put.statusCode).toBe(200);
    expect(await app.container.resolveFeatureModel(workspaceId, 'conventions')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    await app.close();
  });

  it('GET /settings/secrets-status returns booleans only — never the key values', async () => {
    const secrets: SecretsProvider = {
      get: async (k) => (k === 'OPENROUTER_API_KEY' ? 'sk-or-secret-value' : undefined),
    };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { secrets } });

    const res = await app.inject({ method: 'GET', url: '/settings/secrets-status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ openai: false, anthropic: false, openrouter: true, github: false });
    // The actual secret must never appear in the response.
    expect(res.payload).not.toContain('sk-or-secret-value');

    await app.close();
  });
});
