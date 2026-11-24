import type { Db } from '../../../db/client.js';
import type { AgentsRepository, AgentsUnitOfWork } from '../domain/ports.js';
import { DrizzleAgentsRepository } from './agents.repository.js';

/**
 * Runs a use case's writes in one Postgres transaction, handing out
 * repositories bound to it. With drizzle-orm 0.45 + postgres-js the `tx`
 * typechecks as our `Db` (server/INSIGHTS.md), so the same repository class
 * serves both the root connection and the transaction.
 */
export class DrizzleAgentsUnitOfWork implements AgentsUnitOfWork {
  constructor(private readonly db: Db) {}

  run<T>(work: (repos: { agents: AgentsRepository }) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work({ agents: new DrizzleAgentsRepository(tx) }));
  }
}
