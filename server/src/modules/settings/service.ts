import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import type { ProviderClients, SecretVault, SettingsStore } from './ports.js';

/**
 * F1 — settings service: non-secret prefs, which provider keys are set, and
 * the provider connection test.
 *
 * Secrets are NOT stored in the database — only non-secret prefs. The
 * connection test reads or receives a key and does a cheap live call
 * (listModels / GET user).
 */

export interface SettingsServiceDeps {
  settings: SettingsStore;
  secrets: SecretVault;
  clients: ProviderClients;
}

export class SettingsService {
  constructor(private deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return this.deps.settings.get(workspaceId);
  }

  async update(workspaceId: string, userId: string, values: SettingsUpdate): Promise<Settings> {
    await this.deps.settings.put(workspaceId, userId, values);
    return this.deps.settings.get(workspaceId);
  }

  /**
   * Which provider keys are configured (booleans only — the values are NEVER
   * returned). Drives the "Configured / Not set" badges in the API Keys panel.
   */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider credential — the stored one, or a candidate `key`.
   *
   * S11 (security hardening): a candidate key is verified with a throwaway
   * client FIRST and persisted only if the check passes — a typo must never
   * overwrite the working key in ~/.devdigest/secrets.json.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    const { secrets, clients } = this.deps;
    if (key && !secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        const gh = await clients.github(key);
        const login = await gh.currentLogin();
        message = `Connected as @${login}`;
      } else {
        const llm = await clients.llm(provider, key);
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
        await secrets.set!(SECRET_KEY_BY_PROVIDER[provider], key);
        clients.forgetCached();
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
