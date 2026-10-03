import type { Container } from '../../platform/container.js';
import type { ConnTestProvider, ConnTestResult, SecretsStatus, Settings } from '@devdigest/shared';
import { SettingsRepository } from './repository.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings service. Business logic for prefs (get/update) and the
 * provider connection test (persist-then-test). Secrets are NOT stored here —
 * only non-secret prefs; test-connection reads the key via SecretsProvider and
 * does a cheap live call (listModels / GET user).
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async get(workspaceId: string): Promise<Settings> {
    const rows = await this.repo.list(workspaceId);
    return rowsToSettings(rows);
  }

  async update(
    workspaceId: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Settings> {
    await this.repo.upsertMany(workspaceId, userId, Object.entries(body));
    return this.get(workspaceId);
  }

  /** Which provider keys are configured (booleans only — values are NEVER
   *  returned). Drives the "Configured / Not set" badges in the API Keys panel. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
      // If the UI supplied a key, persist it (BYO key) before testing so the
      // test reflects — and the rest of the app can use — the new value.
      if (key) {
        if (!this.container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.container.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.container.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.container.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.container.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }
}
