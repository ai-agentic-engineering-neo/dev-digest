import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import {
  SettingsUpdate,
  ConnTestRequest,
  type ConnTestResult,
  type SecretsStatus,
} from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings module.
 *   GET  /settings                 → current non-secret prefs
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/GitHub)
 *
 * Secrets are NOT stored here — only non-secret prefs. test-connection reads
 * the key via SecretsProvider and does a cheap live call (listModels / GET user).
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/settings', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows);
  });

  // Which provider keys are configured (booleans only — the values are NEVER
  // returned). Drives the "Configured / Not set" badges in the API Keys panel.
  app.get('/settings/secrets-status', async (req): Promise<SecretsStatus> => {
    await getContext(container, req);
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  });

  app.put('/settings', { schema: { body: SettingsUpdate } }, async (req) => {
    const { workspaceId, userId } = await getContext(container, req);
    const body = req.body;
    for (const [key, value] of Object.entries(body)) {
      await container.db
        .insert(t.settings)
        .values({ workspaceId, userId, key, value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    }
    const rows = await container.db
      .select()
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows);
  });

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req): Promise<ConnTestResult> => {
    const { provider, key } = req.body;
    // S11 (security hardening): a candidate key is verified with a
    // throwaway client FIRST and persisted only if the check passes — a typo
    // must never overwrite the working key in ~/.devdigest/secrets.json.
    if (key && !container.secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        const gh = key ? container.githubWithToken(key) : await container.github();
        const login = await gh.currentLogin();
        message = `Connected as @${login}`;
      } else {
        const llm = key ? await container.llmWithKey(provider, key) : await container.llm(provider);
        const models = await llm.listModels();
        message = `OK — ${models.length} models available`;
      }
    } catch (err) {
      const raw = (err as Error).message;
      // Provider SDK errors can echo the key back; never return it.
      const safe = key ? raw.split(key).join('[redacted]') : raw;
      return { provider, ok: false, message: key ? `${safe} — key not saved` : safe };
    }
    if (key) {
      try {
        await container.secrets.set!(SECRET_KEY_BY_PROVIDER[provider], key);
        container.invalidateSecretCaches();
      } catch (err) {
        return { provider, ok: false, message: `Key verified but could not be saved: ${(err as Error).message}` };
      }
    }
    return { provider, ok: true, message };
  });
}
