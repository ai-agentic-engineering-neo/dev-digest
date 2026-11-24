/**
 * Unit of Work port: runs `work` atomically with repositories bound to one
 * transaction. A thrown error rolls everything back. The transaction handle
 * itself never reaches application code — only the repositories `R`.
 */
export interface UnitOfWork<R> {
  run<T>(work: (repos: R) => Promise<T>): Promise<T>;
}
