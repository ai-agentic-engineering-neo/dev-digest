import type { Container } from '../../platform/container.js';
import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { SettingsRepository } from './repository.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings service. Non-secret workspace prefs, plus the provider
 * connection test.
 *
 * The split that matters here: PREFS live in the `settings` table, KEYS live in
 * SecretsProvider. `secretsStatus` deliberately returns booleans — the values
 * are never read back out over the API.
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.repo.listForWorkspace(workspaceId));
  }

  /** Upsert the supplied prefs, then return the full resulting set. */
  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /** Which provider keys are configured — booleans only, never the values. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider credential with a cheap live call (listModels / GET user).
   *
   * A failure is a RESULT, not an exception: the panel renders the message
   * inline, so every path returns `{ ok: false, message }` rather than throwing
   * into the error handler.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
      // A supplied key is persisted (BYO key) BEFORE the test, so the test
      // reflects — and the rest of the app can use — the new value.
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
