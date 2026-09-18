import type { Container } from '../../platform/container.js';
import type { ConnTestProvider, ConnTestResult, Settings, SecretsStatus } from '@devdigest/shared';
import { SettingsRepository } from './repository.js';
import { rowsToSettings } from './helpers.js';
import { GITHUB_PROVIDER, GITLAB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';

/**
 * F1 — settings service. Non-secret prefs (key/value rows) + the
 * connection-test flow. No HTTP and no raw SQL live here — persistence goes
 * through SettingsRepository, secrets through container.secrets.
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async getSettings(workspaceId: string): Promise<Settings> {
    const rows = await this.repo.listRows(workspaceId);
    return rowsToSettings(rows);
  }

  /** Which provider keys are configured (booleans only — values are never returned). */
  async getSecretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.getSettings(workspaceId);
  }

  /**
   * Test a provider key (OpenAI/Anthropic/OpenRouter/GitHub/GitLab). If the UI
   * supplied a key, persist it (BYO key) before testing so the test reflects —
   * and the rest of the app can use — the new value.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
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
      if (provider === GITLAB_PROVIDER) {
        const gl = await this.container.gitlab();
        const login = await gl.currentLogin();
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
