import type {
  GitHubClient,
  LLMProvider,
  Provider,
  SecretsProvider,
  Settings,
} from '@devdigest/shared';

/**
 * F1 — what the settings use cases need from the outside world.
 */

/** Persistence for non-secret prefs (key/value rows per workspace). */
export interface SettingsStore {
  get(workspaceId: string): Promise<Settings>;
  /** Upsert each key of `values` for this user in the workspace. */
  put(workspaceId: string, userId: string, values: Record<string, unknown>): Promise<void>;
}

/** Reads and (when the backend allows it) writes provider keys. */
export type SecretVault = Pick<SecretsProvider, 'get' | 'set'>;

/**
 * Provider clients for the connection test. With a candidate credential the
 * client is a throwaway built from it; without one it is the client for the
 * stored credential.
 */
export interface ProviderClients {
  github(candidateToken?: string): Promise<Pick<GitHubClient, 'currentLogin'>>;
  llm(provider: Provider, candidateKey?: string): Promise<Pick<LLMProvider, 'listModels'>>;
  /** Forget cached clients after a stored secret changed. */
  forgetCached(): void;
}
