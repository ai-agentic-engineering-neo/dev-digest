import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { SettingsService } from './application/settings.service.js';
import { registerSettingsRoutes } from './http/routes.js';
import { DrizzleSettingsRepository } from './infrastructure/settings.repository.js';

/** Settings module factory — adapts container secrets/clients to the module's ports. */
export default async function settingsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const secretsBackend = c.secrets;
  const service = new SettingsService({
    settings: new DrizzleSettingsRepository(c.db),
    secrets: {
      has: async (key) => Boolean(await secretsBackend.get(key)),
      ...(secretsBackend.set ? { set: (key, value) => secretsBackend.set!(key, value) } : {}),
      invalidateCaches: () => c.invalidateSecretCaches(),
    },
    probes: {
      githubLogin: async (key) =>
        (key ? c.githubWithToken(key) : await c.github()).currentLogin(),
      modelCount: async (provider, key) =>
        (await (key ? c.llmWithKey(provider, key) : c.llm(provider)).then((l) => l.listModels()))
          .length,
    },
  });
  await registerSettingsRoutes(app, { service, context: (req) => getContext(c, req) });
}
