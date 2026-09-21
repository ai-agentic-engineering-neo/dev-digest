/**
 * url-fetcher adapter — server-side fetch of a remote text file (skill import).
 *
 * The user supplies the URL, so this is the SSRF edge: https only, no embedded
 * credentials, every resolved address must be public (checked at CONNECT time via
 * a guarded `lookup`, so a DNS-rebinding answer can't slip past a pre-check),
 * every redirect hop re-validated (max 3), a 10 s overall deadline and a 256 KB
 * body cap. Routes never call this — `SkillsService` gets it through the
 * Container. Tests inject `MockUrlFetcher` (adapters/mocks.ts) or a fake
 * transport/resolver into `HttpUrlFetcher`.
 */

export type { FetchedText, UrlFetcher } from './types.js';
export { HttpUrlFetcher, type HttpUrlFetcherOptions, type HttpTransport } from './http.js';
export { isBlockedIp, isIpLiteral } from './ssrf.js';
