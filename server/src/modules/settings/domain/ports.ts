import type {
  ConnTestProvider,
  FeatureModelChoice,
  FeatureModelId,
  SecretKey,
  Settings,
} from '@devdigest/shared';

/** Non-secret workspace prefs, stored as key/value rows. */
export interface SettingsRepository {
  all(workspaceId: string): Promise<Settings>;
  /** Upsert every entry atomically (one row per key). */
  upsert(workspaceId: string, userId: string, entries: Record<string, unknown>): Promise<void>;
  /** The workspace's valid override for a feature model, if any (invalid → undefined). */
  featureModelOverride(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice | undefined>;
}

/** Secrets live outside the DB (~/.devdigest/secrets.json); values never leave this port's callers. */
export interface SecretsStore {
  has(key: SecretKey): Promise<boolean>;
  /** Undefined when the backend is read-only. */
  set?: (key: SecretKey, value: string) => Promise<void>;
  /** Drop cached clients so the next call picks up a new key. */
  invalidateCaches(): void;
}

/**
 * Cheap live calls that prove a key works. With `key` the probe uses a
 * throwaway client for that key; without it, the stored key.
 */
export interface ConnectionProbes {
  githubLogin(key?: string): Promise<string>;
  modelCount(provider: Exclude<ConnTestProvider, 'github'>, key?: string): Promise<number>;
}
