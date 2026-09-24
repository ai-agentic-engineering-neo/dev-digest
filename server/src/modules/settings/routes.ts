import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConnTestRequest, ConnTestResult, SecretsStatus, SettingsUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';

/**
 * Settings response: the stored key/value bag as-is. Deliberately NOT the
 * `Settings` contract — its `.default()`s would inject unset keys, and a stale
 * stored value (e.g. a retired feature id) would turn GET /settings into a 500.
 * Writes are validated by `SettingsUpdate` on PUT.
 */
const SettingsResponse = z.record(z.string(), z.unknown());

/**
 * F1 — settings module (http).
 *   GET  /settings                 → current non-secret prefs
 *   GET  /settings/secrets-status  → which provider keys are configured (booleans)
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → persist an optional key, then test the provider
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const settings = () => container.modules.settings.service;

  app.get('/settings', { schema: { response: { 200: SettingsResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return settings().get(workspaceId);
  });

  app.get('/settings/secrets-status', { schema: { response: { 200: SecretsStatus } } }, async (req) => {
    await getContext(container, req);
    return settings().secretsStatus();
  });

  app.put(
    '/settings',
    { schema: { body: SettingsUpdate, response: { 200: SettingsResponse } } },
    async (req) => {
      const { workspaceId, userId } = await getContext(container, req);
      return settings().update(workspaceId, userId, req.body);
    },
  );

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest, response: { 200: ConnTestResult } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => settings().testConnection(req.body.provider, req.body.key),
  );
}
