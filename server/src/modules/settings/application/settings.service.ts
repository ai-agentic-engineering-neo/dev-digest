import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Settings,
} from '@devdigest/shared';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER, redactKey } from '../domain/policies.js';
import type { ConnectionProbes, SecretsStore, SettingsRepository } from '../domain/ports.js';

export interface SettingsDeps {
  settings: SettingsRepository;
  secrets: SecretsStore;
  probes: ConnectionProbes;
}

/**
 * F1 — settings. Non-secret prefs live in the DB; secrets only in the
 * SecretsStore, and their values never appear in a result.
 */
export class SettingsService {
  constructor(private readonly d: SettingsDeps) {}

  get(workspaceId: string): Promise<Settings> {
    return this.d.settings.all(workspaceId);
  }

  async update(workspaceId: string, userId: string, patch: Record<string, unknown>): Promise<Settings> {
    await this.d.settings.upsert(workspaceId, userId, patch);
    return this.d.settings.all(workspaceId);
  }

  /** Which provider keys are configured — booleans only. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, (typeof SECRET_KEY_BY_PROVIDER)[keyof SecretsStatus]][]).map(
        async ([provider, key]) => [provider, await this.d.secrets.has(key)] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider connection. A candidate `key` is verified with a throwaway
   * client FIRST and persisted only if the check passes — a typo must never
   * overwrite the working key.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    const { secrets, probes } = this.d;
    if (key && !secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        message = `Connected as @${await probes.githubLogin(key)}`;
      } else {
        message = `OK — ${await probes.modelCount(provider, key)} models available`;
      }
    } catch (err) {
      const safe = redactKey((err as Error).message, key);
      return { provider, ok: false, message: key ? `${safe} — key not saved` : safe };
    }
    if (key) {
      try {
        await secrets.set!(SECRET_KEY_BY_PROVIDER[provider], key);
        secrets.invalidateCaches();
      } catch (err) {
        return {
          provider,
          ok: false,
          message: `Key verified but could not be saved: ${(err as Error).message}`,
        };
      }
    }
    return { provider, ok: true, message };
  }
}
