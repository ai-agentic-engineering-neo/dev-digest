import { describe, it, expect } from 'vitest';
import { SettingsService, type SettingsStore } from '../src/modules/settings/service.js';
import { WorkspaceService } from '../src/modules/workspace/service.js';
import type { SettingsRow } from '../src/modules/settings/helpers.js';

// Application layer with in-memory fakes of its ports — no Postgres, no Fastify
// (onion-architecture §12).

function memoryStore(): SettingsStore & { rows: Map<string, unknown>; writes: string[] } {
  const rows = new Map<string, unknown>();
  const writes: string[] = [];
  return {
    rows,
    writes,
    async listForWorkspace(): Promise<SettingsRow[]> {
      return [...rows].map(([key, value]) => ({ key, value }));
    },
    async upsertMany(_ws, _user, entries) {
      for (const [k, v] of entries) {
        rows.set(k, v);
        writes.push(k);
      }
    },
  };
}

describe('SettingsService', () => {
  it('get collapses key/value rows into one settings object', async () => {
    const store = memoryStore();
    store.rows.set('theme', 'light');
    store.rows.set('polling_interval_min', 10);
    const svc = new SettingsService({ store });
    expect(await svc.get('ws1')).toEqual({ theme: 'light', polling_interval_min: 10 });
  });

  it('update upserts only the given keys and returns the full settings', async () => {
    const store = memoryStore();
    store.rows.set('theme', 'dark');
    const svc = new SettingsService({ store });
    const out = await svc.update('ws1', 'u1', { density: 'compact' });
    expect(store.writes).toEqual(['density']);
    expect(out).toEqual({ theme: 'dark', density: 'compact' });
  });
});

describe('WorkspaceService', () => {
  it('overview returns the clone dir and the repo summaries of the workspace', async () => {
    const summary = {
      id: 'r1',
      full_name: 'acme/payments-api',
      clone_path: '/clones/acme/payments-api',
      last_polled_at: null,
      cloned: true,
    };
    let askedFor = '';
    const svc = new WorkspaceService({
      cloneDir: '/clones',
      repos: {
        async listRepoSummaries(ws) {
          askedFor = ws;
          return [summary];
        },
      },
    });
    expect(await svc.overview('ws1')).toEqual({ workspaceId: 'ws1', cloneDir: '/clones', repos: [summary] });
    expect(askedFor).toBe('ws1');
  });
});
