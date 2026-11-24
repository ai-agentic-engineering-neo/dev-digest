/**
 * Minimal logging port for use cases that degrade gracefully (offline GitHub,
 * missing token) and must say so. Pino's logger satisfies it structurally.
 */
export interface Logger {
  warn(obj: object, msg: string): void;
}
