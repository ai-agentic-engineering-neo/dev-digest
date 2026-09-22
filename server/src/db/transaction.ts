import type { TransactionRunner } from '../application/transaction.js';
import type { Db, DbOrTx } from './client.js';

/**
 * Drizzle implementation of the TransactionRunner port: `db.transaction(tx => …)`
 * with the repositories re-bound to `tx` by `bind`. Built only in the
 * composition root (`Container.transactionRunner`).
 */
export class DrizzleTransactionRunner<R> implements TransactionRunner<R> {
  constructor(
    private readonly db: Db,
    private readonly bind: (tx: DbOrTx) => R,
  ) {}

  run<T>(work: (repos: R) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(this.bind(tx)));
  }
}
