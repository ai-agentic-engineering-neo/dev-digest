/**
 * Port — outbound HTTP for URLs that come from a user (e.g. "import a skill
 * from URL"). S7 (plans/18-security-fixes.md): the implementation must refuse
 * to connect to non-public addresses, checked on the address actually being
 * connected to (after DNS), so a hostname that resolves — or re-resolves — to
 * loopback or a private range cannot be reached.
 *
 * Shaped like `fetch` so callers keep their streaming/redirect logic.
 * Redirects are never followed by the implementation: callers pass
 * `redirect: 'manual'` and validate each hop themselves.
 */
export type HttpFetch = (
  url: URL,
  init: { signal: AbortSignal; redirect: 'manual' },
) => Promise<Response>;

/** Thrown by an HttpFetch implementation when the target address is not public. */
export class BlockedHostError extends Error {
  constructor(public readonly host: string) {
    super(`Refusing to connect to a non-public address for host '${host}'`);
    this.name = 'BlockedHostError';
  }
}
