import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  SettingsUpdate,
  ConnTestRequest,
  type ConnTestResult,
  type SecretsStatus,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { SettingsService } from './service.js';

/**
 * F1 — settings module. Transport layer only.
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/GitHub)
 *
 * Secrets are NOT stored in the settings table — only non-secret prefs.
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SettingsService(app.container);

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId);
  });

  app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
    await getContext(app.container, req);
    return service.secretsStatus();
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return service.update(workspaceId, userId, req.body);
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<ConnTestResult> => {
      const { provider, key } = req.body;
      return service.testConnection(provider, key);
    },
  );
}
