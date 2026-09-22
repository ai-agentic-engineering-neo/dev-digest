import { describe, it, expect } from 'vitest';
import { DrizzleTransactionRunner } from '../src/db/transaction.js';
import type { Db, DbOrTx } from '../src/db/client.js';

/** The runner re-binds the repositories to the tx handle and propagates results/throws. */
describe('DrizzleTransactionRunner', () => {
  const tx = { kind: 'tx' } as unknown as DbOrTx;
  const db = {
    transaction: async <T>(fn: (t: DbOrTx) => Promise<T>) => fn(tx),
  } as unknown as Db;

  it('hands work repositories bound to the transaction and returns its result', async () => {
    const runner = new DrizzleTransactionRunner(db, (handle) => ({ repo: { handle } }));
    const seen = await runner.run(async ({ repo }) => repo.handle);
    expect(seen).toBe(tx);
  });

  it('propagates a throw (the driver rolls back)', async () => {
    const runner = new DrizzleTransactionRunner(db, () => ({}));
    await expect(runner.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});
