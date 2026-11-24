import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConnTestRequest, SettingsUpdate } from '@devdigest/shared';
import type { RequestContext } from '../../_shared/context.js';
import type { SettingsService } from '../application/settings.service.js';

export interface SettingsRouteDeps {
  service: SettingsService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * F1 — settings.
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured (booleans only)
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key; a valid new key is saved
 */
export async function registerSettingsRoutes(
  appBase: FastifyInstance,
  { service, context }: SettingsRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/settings', async (req) => {
    const { workspaceId } = await context(req);
    return service.get(workspaceId);
  });

  app.get('/settings/secrets-status', async (req) => {
    await context(req);
    return service.secretsStatus();
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await context(req);
    return service.update(workspaceId, userId, req.body);
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    // No tenancy lookup: keys are machine-global, not workspace-scoped.
    async (req) => service.testConnection(req.body.provider, req.body.key),
  );
}
