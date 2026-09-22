/**
 * TransactionRunner — application-ring port. The USE CASE decides the
 * transaction boundary; repositories never open one on their own.
 *
 *   await this.deps.tx.run(async ({ agents, versions }) => {
 *     const agent = await agents.insert(...);
 *     await versions.snapshot(agent);
 *   });
 *
 * `R` is the bundle of transaction-bound repositories the use case needs; the
 * composition root decides how to build it (see `Container.transactionRunner`).
 * A throw inside `work` rolls everything back. Keep only DB work inside — no
 * LLM / GitHub / git calls while the transaction is open.
 */
export interface TransactionRunner<R> {
  run<T>(work: (repos: R) => Promise<T>): Promise<T>;
}
