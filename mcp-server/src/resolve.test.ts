import { describe, expect, it } from 'vitest';
import { resolvePr, resolveRepo, ToolInputError } from './resolve.js';
import { stubClient } from './test-utils.js';

describe('resolveRepo', () => {
  it('matches on exact full_name', async () => {
    const client = stubClient({
      get: async () => [{ id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' }],
    });
    await expect(resolveRepo(client, 'acme/payments-api')).resolves.toMatchObject({ id: 'r1' });
  });

  it('throws a ToolInputError naming the expected format when not found', async () => {
    const client = stubClient({ get: async () => [] });
    await expect(resolveRepo(client, 'nope/nope')).rejects.toThrow(ToolInputError);
    await expect(resolveRepo(client, 'nope/nope')).rejects.toThrow(/owner\/name/);
  });
});

describe('resolvePr', () => {
  it('matches on exact number', async () => {
    const client = stubClient({ get: async () => [{ id: 'p1', number: 482, title: 'x' }] });
    await expect(resolvePr(client, 'r1', 482)).resolves.toMatchObject({ id: 'p1' });
  });

  it('throws a ToolInputError naming the next action when not found', async () => {
    const client = stubClient({ get: async () => [] });
    await expect(resolvePr(client, 'r1', 999)).rejects.toThrow(ToolInputError);
    await expect(resolvePr(client, 'r1', 999)).rejects.toThrow(/synced/);
  });
});
