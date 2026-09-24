/**
 * SSRF-guarded HTTPS fetcher for URL import (server/specs/03-skills.md Rules §8).
 *
 * - The URL is validated by the domain guard (https, 443, no credentials) on
 *   EVERY hop; redirects are followed manually, at most 3.
 * - The host must resolve ONLY to public addresses. The check runs before the
 *   request AND inside the socket's own `lookup`, so the address the socket
 *   connects to is the one that was checked (no DNS-rebinding window).
 * - 10 s overall timeout, 1 MB body cap.
 *
 * `resolve` and `transport` are injectable so the guard is unit-testable
 * without a network (test/skills-import.test.ts).
 */
import { promises as dns } from 'node:dns';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import type { FetchedDocument, UrlFetcher } from '../application/ports.js';
import { URL_IMPORT_MAX_BYTES, URL_IMPORT_MAX_REDIRECTS, URL_IMPORT_TIMEOUT_MS } from '../domain/constants.js';
import { invalidImport } from '../domain/import.js';
import { bareHost, isPublicAddress, parseImportUrl } from '../domain/url-guard.js';

/** Every address a host name resolves to. */
export type Resolver = (hostname: string) => Promise<string[]>;

export interface HttpResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  body: AsyncIterable<Uint8Array>;
  /** Drop the rest of the body (redirects, oversize). */
  cancel(): void;
}

/** One GET without following redirects; must connect through `lookup`. */
export type HttpTransport = (url: URL, opts: { signal: AbortSignal; lookup: LookupFunction }) => Promise<HttpResponse>;

export interface GuardedFetcherOptions {
  resolve?: Resolver;
  transport?: HttpTransport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export const systemResolver: Resolver = async (hostname) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Resolve and require every address to be public; returns the addresses. */
async function publicAddresses(resolve: Resolver, hostname: string): Promise<string[]> {
  const host = bareHost(hostname);
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw invalidImport(`Could not resolve ${host}`);
  }
  if (addresses.length === 0) throw invalidImport(`Could not resolve ${host}`);
  const blocked = addresses.find((a) => !isPublicAddress(a));
  if (blocked) throw invalidImport(`${host} resolves to a non-public address (${blocked})`);
  return addresses;
}

/** A `net` lookup that only ever hands the socket checked public addresses. */
export function guardedLookup(resolve: Resolver): LookupFunction {
  return ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    publicAddresses(resolve, hostname).then(
      (addresses) => {
        const family = (a: string) => (a.includes(':') ? 6 : 4);
        if (options?.all) callback(null, addresses.map((address) => ({ address, family: family(address) })));
        else callback(null, addresses[0], family(addresses[0]!));
      },
      (err: Error) => callback(err),
    );
  }) as unknown as LookupFunction;
}

/** Node https GET (no redirect following, no proxy, bounded by `signal`). */
export const httpsTransport: HttpTransport = (url, { signal, lookup }) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        signal,
        lookup,
        headers: { 'user-agent': 'DevDigest-skill-import', accept: 'text/markdown, text/plain, application/zip, */*' },
      },
      (res) => {
        const header = (name: string) => {
          const v = res.headers[name];
          return (Array.isArray(v) ? v[0] : v) ?? null;
        };
        resolve({
          status: res.statusCode ?? 0,
          location: header('location'),
          contentType: header('content-type'),
          body: res,
          cancel: () => res.destroy(),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

async function readCapped(res: HttpResponse, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) {
      res.cancel();
      throw invalidImport(`The document is larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export class GuardedFetcher implements UrlFetcher {
  private readonly resolve: Resolver;
  private readonly transport: HttpTransport;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;

  constructor(opts: GuardedFetcherOptions = {}) {
    this.resolve = opts.resolve ?? systemResolver;
    this.transport = opts.transport ?? httpsTransport;
    this.timeoutMs = opts.timeoutMs ?? URL_IMPORT_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? URL_IMPORT_MAX_BYTES;
    this.maxRedirects = opts.maxRedirects ?? URL_IMPORT_MAX_REDIRECTS;
  }

  async fetch(start: URL): Promise<FetchedDocument> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const lookup = guardedLookup(this.resolve);
    let url = parseImportUrl(start.href);
    for (let hop = 0; ; hop++) {
      await publicAddresses(this.resolve, url.hostname);
      const res = await this.request(url, signal, lookup);
      if (REDIRECTS.has(res.status)) {
        res.cancel();
        if (!res.location) throw invalidImport(`Redirect (${res.status}) without a location`);
        if (hop >= this.maxRedirects) throw invalidImport(`More than ${this.maxRedirects} redirects`);
        url = parseImportUrl(new URL(res.location, url).href);
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.cancel();
        throw invalidImport(`The server answered HTTP ${res.status}`);
      }
      try {
        return { bytes: await readCapped(res, this.maxBytes), contentType: res.contentType, finalUrl: url.href };
      } catch (err) {
        throw signal.aborted ? invalidImport('The download timed out') : err;
      }
    }
  }

  private async request(url: URL, signal: AbortSignal, lookup: LookupFunction): Promise<HttpResponse> {
    try {
      return await this.transport(url, { signal, lookup });
    } catch (err) {
      if (signal.aborted) throw invalidImport(`Fetching ${url.hostname} timed out`);
      const reason = (err as Error).message;
      throw invalidImport(`Could not fetch ${url.hostname}: ${reason}`);
    }
  }
}
