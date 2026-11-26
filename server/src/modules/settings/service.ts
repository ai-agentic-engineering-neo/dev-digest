import type { Settings, SettingsUpdate } from '@devdigest/shared';
import { rowsToSettings, type SettingsRow } from './helpers.js';

/** What the settings use cases need from storage (implemented by SettingsRepository). */
export interface SettingsStore {
  listForWorkspace(workspaceId: string): Promise<SettingsRow[]>;
  upsertMany(workspaceId: string, userId: string, entries: [string, unknown][]): Promise<void>;
}

/**
 * settings — application. Non-secret prefs only; secrets go through
 * SecretsProvider and never reach this service.
 */
export class SettingsService {
  constructor(private readonly deps: { store: SettingsStore }) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.store.listForWorkspace(workspaceId));
  }

  /** Upsert the given keys, then return the full, current settings. */
  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    await this.deps.store.upsertMany(workspaceId, userId, Object.entries(patch));
    return this.get(workspaceId);
  }
}
