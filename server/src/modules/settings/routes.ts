import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SettingsUpdate, ConnTestRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { SettingsRepository } from './repository.js';
import { SettingsService } from './service.js';

/**
 * F1 — settings module. Transport layer only.
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/GitHub)
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const service = new SettingsService({
    settings: new SettingsRepository(container.db),
    secrets: container.secrets,
    clients: {
      github: async (token) => (token ? container.githubWithToken(token) : container.github()),
      llm: (provider, key) => (key ? container.llmWithKey(provider, key) : container.llm(provider)),
      forgetCached: () => container.invalidateSecretCaches(),
    },
  });

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId);
  });

  app.get('/settings/secrets-status', async (req) => {
    await getContext(container, req);
    return service.secretsStatus();
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await getContext(container, req);
    return service.update(workspaceId, userId, req.body);
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => service.testConnection(req.body.provider, req.body.key),
  );
}
