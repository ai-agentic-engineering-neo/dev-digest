import type {
  ConnTestProvider,
  ConnTestResult,
  GitHubClient,
  LLMProvider,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';
import type { SettingsRepository } from './repository.js';

/** The credential capabilities this module needs, named by the consumer. */
export interface SettingsSecretsPort {
  get(key: string): Promise<string | undefined | null>;
  set?(key: string, value: string): Promise<void>;
}

export interface SettingsProvidersPort {
  github(): Promise<GitHubClient>;
  llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
  invalidateSecretCaches(): void;
}

/**
 * F1 — settings use cases: read prefs, upsert prefs, report which provider keys
 * are configured, and test a provider credential.
 *
 * Secrets are NOT stored in the settings table — only non-secret prefs.
 */
export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly secrets: SettingsSecretsPort,
    private readonly providers: SettingsProvidersPort,
  ) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.repo.listForWorkspace(workspaceId));
  }

  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    await this.repo.upsert(workspaceId, userId, Object.entries(patch));
    return this.get(workspaceId);
  }

  /** Booleans only — a key's value is NEVER returned. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider credential. A supplied key is persisted first (BYO key) so
   * the test reflects — and the rest of the app can use — the new value.
   * Never throws: a failed connection is a result, not an error.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
      if (key) {
        if (!this.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.providers.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const login = await (await this.providers.github()).currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const models = await (await this.providers.llm(provider)).listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }
}
