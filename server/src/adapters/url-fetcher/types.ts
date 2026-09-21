/**
 * url-fetcher adapter (port types) — server-side fetch of a remote text file (skill import).
 *
 * The user supplies the URL, so this is the SSRF edge: https only, no embedded
 * credentials, every resolved address must be public (checked at CONNECT time via
 * a guarded `lookup`, so a DNS-rebinding answer can't slip past a pre-check),
 * every redirect hop re-validated (max 3), a 10 s overall deadline and a 256 KB
 * body cap. Routes never call this — `SkillsService` gets it through the
 * Container. Tests inject `MockUrlFetcher` (adapters/mocks.ts) or a fake
 * transport/resolver into `HttpUrlFetcher`.
 */

export interface FetchedText {
  /** Final URL after redirects. */
  url: string;
  /** Response body decoded as UTF-8. */
  text: string;
  /** Lower-cased media type without parameters, when the server sent one. */
  contentType?: string;
}

export interface UrlFetcher {
  /** Fetch `url` as UTF-8 text. Throws `ValidationError` (bad/blocked/too large) or `ExternalServiceError`. */
  fetchText(url: string): Promise<FetchedText>;
}
