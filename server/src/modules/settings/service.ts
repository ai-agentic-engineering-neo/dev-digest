import type {
  ConnTestProvider,
  ConnTestResult,
  FeatureModelChoice,
  FeatureModelId,
  GitHubClient,
  LLMProvider,
  SecretsProvider,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import type { SettingsRepository } from './repository.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { defaultFeatureModel, featureModelOverride, rowsToSettings } from './helpers.js';

export interface SettingsServiceDeps {
  settings: Pick<SettingsRepository, 'listForWorkspace' | 'upsertMany'>;
  secrets: SecretsProvider;
  github: () => Promise<GitHubClient>;
  llm: (provider: Exclude<ConnTestProvider, 'github'>) => Promise<LLMProvider>;
  /** Drop cached provider clients after a key/PAT changed. */
  invalidateSecretCaches: () => void;
}

/**
 * F1 — settings use cases: non-secret prefs (key/value rows), which provider
 * keys are configured, and the provider connection test. Secrets are never
 * stored as settings — only via SecretsProvider.
 */
export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.settings.listForWorkspace(workspaceId));
  }

  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    const entries = Object.entries(patch).map(([key, value]) => ({ key, value }));
    await this.deps.settings.upsertMany(workspaceId, userId, entries);
    return this.get(workspaceId);
  }

  /** Booleans only — the key values are NEVER returned. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Persist a supplied key (BYO key) and do a cheap live call (list models /
   * GET user). Never throws: failures come back as `{ ok: false, message }`.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    try {
      if (key) {
        if (!this.deps.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.deps.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.deps.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const login = await (await this.deps.github()).currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const models = await (await this.deps.llm(provider)).listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }

  /**
   * The workspace's model override for a feature, or `undefined` when unset/
   * invalid. Callers with their own dynamic default (e.g. conventions) use this.
   */
  async getFeatureModelOverride(
    workspaceId: string,
    id: FeatureModelId,
  ): Promise<FeatureModelChoice | undefined> {
    return featureModelOverride(await this.get(workspaceId), id);
  }

  /** A feature's provider+model: workspace override, else the registry default. */
  async resolveFeatureModel(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.getFeatureModelOverride(workspaceId, id)) ?? defaultFeatureModel(id);
  }
}
